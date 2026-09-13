"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { getIdentity } from "@/lib/identity";
import { extractBillData, type BillData } from "@/lib/ocr";
import { formatRupee, parseNumber } from "@/lib/format";
import { computeBillTotal, itemTotal } from "@/lib/settlement";
import { useSessionLive } from "@/lib/useSessionLive";
import { deleteItemAndClaims, deleteSession } from "@/lib/sessionWrites";
import {
  Field,
  BackButton,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusText,
  BrandHeader,
  UploadButton,
  Badge,
} from "@/components/ui";

export default function HostSetupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, items, loading, missing } = useSessionLive(id);
  const [identity, setIdentityState] = useState<ReturnType<typeof getIdentity>>(
    null
  );
  const [identityReady, setIdentityReady] = useState(false);

  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newQty, setNewQty] = useState("");
  const [tax, setTax] = useState("");
  const [service, setService] = useState("");
  const [discount, setDiscount] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [reading, setReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoFiles, setPhotoFiles] = useState<{ id: string; file: File; url: string }[]>([]);
  const [readProgress, setReadProgress] = useState(0);
  const [ocrDebugData, setOcrDebugData] = useState<BillData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editQty, setEditQty] = useState("");

  useEffect(() => {
    setIdentityState(getIdentity(id));
    setIdentityReady(true);
  }, [id]);

  useEffect(() => {
    if (!session || hydrated) return;
    setTax(session.taxAmount ? String(session.taxAmount) : "");
    setService(
      session.serviceChargeAmount ? String(session.serviceChargeAmount) : ""
    );
    setDiscount(session.discountAmount ? String(session.discountAmount) : "");
    setHydrated(true);
  }, [session, hydrated]);

  if (loading || !identityReady) return <Screen><StatusText>Loading session…</StatusText></Screen>;
  if (missing || !session) {
    return <Screen><StatusText>Session not found.</StatusText></Screen>;
  }
  if (session.status === "cancelled") {
    return <Screen><StatusText>This session was cancelled.</StatusText></Screen>;
  }
  if (session.status === "expired") {
    return <Screen><StatusText>This session has expired.</StatusText></Screen>;
  }
  if (!identity?.isHost) {
    return (
      <Screen>
        <StatusText>Only the host can set up this session.</StatusText>
      </Screen>
    );
  }
  if (session.status !== "draft") {
    router.replace(`/session/${id}/join`);
    return <Screen><StatusText>Opening session…</StatusText></Screen>;
  }

  function goBack() {
    if (items.length > 0 && !window.confirm("Discard this session setup?")) return;
    router.push("/");
  }

  const computedItemsTotal = items.reduce((sum, item) => sum + itemTotal(item), 0);
  const computedTotal = computeBillTotal(
    items,
    parseNumber(tax),
    parseNumber(service),
    parseNumber(discount)
  );

  async function addItem(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const price = parseNumber(newPrice);
    const quantity = parseNumber(newQty);
    if (!name || price <= 0) return;
    await addDoc(collection(db, "sessions", id, "items"), {
      name,
      price,
      ...(newQty.trim() ? { quantity } : {}),
    });
    setNewName("");
    setNewPrice("");
    setNewQty("");
  }

  async function saveEdit(itemId: string) {
    await updateDoc(doc(db, "sessions", id, "items", itemId), {
      name: editName.trim(),
      price: parseNumber(editPrice),
      ...(editQty.trim() ? { quantity: parseNumber(editQty) } : {}),
    });
    setEditingId(null);
  }

  async function removeItem(itemId: string) {
    await deleteItemAndClaims(id, itemId);
  }

  async function removeSession() {
    if (!window.confirm("Delete this session permanently?")) return;
    setBusy(true);
    try {
      await deleteSession(id);
      router.push("/");
    } finally {
      setBusy(false);
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function addPhotos(files: FileList | null) {
    if (!files?.length) {
      setError("No image was selected.");
      return;
    }

    const nextPhotos = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!nextPhotos.length) {
      setError("Please choose a valid image file like PNG, JPG, or HEIC.");
      return;
    }

    setPhotoFiles((current) => [
      ...current,
      ...nextPhotos.map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
    setError("");
  }

  function removePhoto(photoId: string) {
    setPhotoFiles((current) => {
      const photo = current.find(({ id }) => id === photoId);
      if (photo) URL.revokeObjectURL(photo.url);
      const next = current.filter(({ id }) => id !== photoId);
      if (next.length === 0) {
        setOcrDebugData(null);
        setReadProgress(0);
      }
      return next;
    });
    setError("");
  }

  async function confirmPhotos() {
    if (!photoFiles.length) return;
    setReading(true);
    setReadProgress(5);
    setError("");
    try {
      const extracted: BillData[] = [];
      for (const [index, photo] of photoFiles.entries()) {
        const ocr = await extractBillData(photo.file);
        if (!ocr.success || !ocr.data) {
          throw new Error(ocr.error || `Could not read photo ${index + 1}`);
        }
        extracted.push(ocr.data);
        setReadProgress(Math.round(((index + 1) / photoFiles.length) * 70));
      }
      const data: BillData = {
        items: extracted.flatMap((result) => result.items),
        subtotal: extracted.reduce((sum, result) => sum + (result.subtotal ?? 0), 0) || null,
        tax: extracted.reduce((sum, result) => sum + (result.tax ?? 0), 0) || null,
        serviceCharge: extracted.reduce((sum, result) => sum + (result.serviceCharge ?? 0), 0) || null,
        total: extracted.reduce((sum, result) => sum + (result.total ?? 0), 0) || null,
      };
      setOcrDebugData(data);
      setReadProgress(82);
      const batch = writeBatch(db);
      for (const item of items) {
        batch.delete(doc(db, "sessions", id, "items", item.id));
      }
      for (const item of data.items ?? []) {
        const ref = doc(collection(db, "sessions", id, "items"));
        batch.set(ref, {
          name: item.name || "Item",
          price: Number(item.price) || 0,
          quantity: Number(item.quantity) || 1,
        });
      }
      batch.update(doc(db, "sessions", id), {
        taxAmount: Number(data.tax) || 0,
        serviceChargeAmount: Number(data.serviceCharge) || 0,
        discountAmount: 0,
        billTotal: Number(data.total) || 0,
      });
      await batch.commit();
      setReadProgress(100);
      setTax(data.tax ? String(data.tax) : "");
      setService(data.serviceCharge ? String(data.serviceCharge) : "");
      setDiscount("");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not read that bill. Add items manually."
      );
    } finally {
      setReading(false);
    }
  }

  async function openSession() {
    setBusy(true);
    setError("");
    try {
      if (items.length === 0) {
        setError("Add at least one item.");
        setBusy(false);
        return;
      }
      await updateDoc(doc(db, "sessions", id), {
        taxAmount: parseNumber(tax),
        serviceChargeAmount: parseNumber(service),
        discountAmount: parseNumber(discount),
        billTotal: computeBillTotal(items, parseNumber(tax), parseNumber(service), parseNumber(discount)),
        status: "open",
        updatedAt: serverTimestamp(),
      });
      router.push(`/session/${id}/join`);
    } catch {
      setError("Could not open the session.");
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BackButton onClick={goBack} />
      <BrandHeader />
      <div className="flex items-center gap-2 mb-2">
        <h1 className="text-xl font-medium">{session.restaurantName}</h1>
        <Badge tone="green">You&apos;re the host</Badge>
      </div>
      <p className="mb-6 text-sm text-muted">Add the bill, then open voting.</p>

      <div className="space-y-3">
        <div className="space-y-3">
          {photoFiles.length ? (
            <div className="flex justify-start">
              <div className="relative w-20 overflow-hidden rounded-lg border border-line bg-[#F7F6F1] shadow-sm">
                {photoFiles.map((photo) => (
                  <div key={photo.id} className="relative aspect-square">
                    <img src={photo.url} alt={photo.file.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label={`Remove ${photo.file.name}`}
                      onClick={() => removePhoto(photo.id)}
                      disabled={reading}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-sm leading-none text-red-700 shadow"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <UploadButton
            type="button"
            onClick={(e) => {
              e.preventDefault();
              if (photoFiles.length) {
                void confirmPhotos();
                return;
              }
              openFilePicker();
            }}
            disabled={reading}
          >
            {photoFiles.length ? "Confirm" : "Upload bill photo"}
          </UploadButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
            multiple
            className="hidden"
            disabled={reading}
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
          {photoFiles.length ? (
            <SecondaryButton
              type="button"
              disabled={reading}
              onClick={() => openFilePicker()}
            >
              Add another photo
            </SecondaryButton>
          ) : null}
        </div>
        {reading ? (
          <div aria-label={`Reading bill progress: ${readProgress}%`} className="space-y-1">
            <div className="h-1 w-full overflow-hidden rounded-full bg-[#DCE9DF]">
              <div className="h-full rounded-full bg-[#4FAE7A] transition-[width] duration-300" style={{ width: `${readProgress}%` }} />
            </div>
            <p className="text-sm text-muted">Reading bill...</p>
          </div>
        ) : null}
        {process.env.NODE_ENV === "development" && ocrDebugData ? (
          <section className="rounded-lg border border-dashed border-accent bg-accent/5 p-3 text-sm">
            <p className="mb-2 font-medium text-accent">Data in the bill</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-muted">
                  <tr><th className="pb-1 pr-3 font-medium">Name</th><th className="pb-1 pr-3 font-medium">Qty</th><th className="pb-1 font-medium">Price</th></tr>
                </thead>
                <tbody>
                  {ocrDebugData.items.map((item, index) => (
                    <tr key={`${item.name}-${index}`} className="border-t border-accent/20">
                      <td className="py-1 pr-3">{item.name}</td><td className="py-1 pr-3">{item.quantity}</td><td className="py-1">{formatRupee(item.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              Subtotal: {ocrDebugData.subtotal == null ? "—" : formatRupee(ocrDebugData.subtotal)} · Tax: {ocrDebugData.tax == null ? "—" : formatRupee(ocrDebugData.tax)} · Service: {ocrDebugData.serviceCharge == null ? "—" : formatRupee(ocrDebugData.serviceCharge)} · Total: {ocrDebugData.total == null ? "—" : formatRupee(ocrDebugData.total)}
            </p>
          </section>
        ) : null}

        <form onSubmit={addItem} className="space-y-3 border-t border-line pt-4">
          <p className="text-sm text-muted">Add items manually</p>
          <Field
            label="Item name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Price (₹)"
              inputMode="decimal"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="font-mono"
            />
            <Field
              label="Quantity (optional)"
              inputMode="numeric"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              className="font-mono"
            />
          </div>
          <SecondaryButton type="submit">+ Add</SecondaryButton>
        </form>
      </div>

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {items.length === 0 ? (
          <li className="py-4 text-sm text-muted">No items yet.</li>
        ) : (
          items.map((item) => (
            <li key={item.id} className="py-3">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <Field
                    label="Name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Price (₹)"
                      inputMode="decimal"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className="font-mono"
                    />
                    <Field
                      label="Qty (optional)"
                      inputMode="numeric"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <PrimaryButton type="button" onClick={() => saveEdit(item.id)}>
                      Save
                    </PrimaryButton>
                    <SecondaryButton type="button" onClick={() => setEditingId(null)}>
                      Cancel
                    </SecondaryButton>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-medium">{item.name}</p>
                    <p className="text-sm text-muted">
                      <span className="font-mono font-bold text-[#2F6E5E]">₹{item.price}</span> · qty <span className="font-mono">{item.quantity}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="min-h-[44px] px-3 text-sm text-accent"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditName(item.name);
                        setEditPrice(String(item.price));
                        setEditQty(String(item.quantity));
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="min-h-[44px] px-3 text-sm text-red-700"
                      onClick={() => removeItem(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))
        )}
      </ul>

      <div className="mt-6 space-y-3 pb-32">
        <Field
          label="Tax amount (₹)"
          inputMode="decimal"
          value={tax}
          onChange={(e) => setTax(e.target.value)}
        />
        <Field
          label="Service charge amount (₹)"
          inputMode="decimal"
          value={service}
          onChange={(e) => setService(e.target.value)}
        />
        <Field
          label="Discount amount (₹)"
          inputMode="decimal"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </div>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-6 space-y-3 pb-32">
        <PrimaryButton type="button" disabled={busy} onClick={openSession}>
          {busy ? "Opening…" : "Open session for voting"}
        </PrimaryButton>
        <button type="button" disabled={busy} onClick={removeSession} className="min-h-[42px] w-full text-sm text-red-700">
          Delete session
        </button>
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-[#E4DFD3] bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] backdrop-blur">
        <div className="mx-auto max-w-md">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-muted">Total</p>
            <p className="text-2xl font-bold font-mono text-[#2F6E5E]">{formatRupee(computedTotal)}</p>
          </div>
          <p className="mt-1 truncate text-xs text-muted">
            Items: {formatRupee(computedItemsTotal)} + Tax: {formatRupee(parseNumber(tax))} + Service: {formatRupee(parseNumber(service))} - Discount: {formatRupee(parseNumber(discount))}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted">
            Check this matches your printed bill before opening for voting.
          </p>
        </div>
      </div>
    </Screen>
  );
}
