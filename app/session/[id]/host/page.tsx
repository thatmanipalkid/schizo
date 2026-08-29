"use client";

import { FormEvent, useEffect, useState } from "react";
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
import { fileToBase64Image } from "@/lib/image";
import { parseNumber } from "@/lib/format";
import { useSessionLive } from "@/lib/useSessionLive";
import { deleteItemAndClaims, deleteSession } from "@/lib/sessionWrites";
import {
  Field,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusText,
} from "@/components/ui";

type ParsedBill = {
  items: { name: string; price: number; quantity: number }[];
  tax: number;
  serviceCharge: number;
  discount: number;
  total: number;
};

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
  const [billTotal, setBillTotal] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [reading, setReading] = useState(false);
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
    setBillTotal(session.billTotal ? String(session.billTotal) : "");
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

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setError("");
    try {
      const { base64, mediaType } = await fileToBase64Image(file);
      const res = await fetch("/api/parse-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = (await res.json()) as ParsedBill & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not read bill");
      const batch = writeBatch(db);
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
        discountAmount: Number(data.discount) || 0,
        billTotal: Number(data.total) || 0,
      });
      await batch.commit();
      setTax(data.tax ? String(data.tax) : "");
      setService(data.serviceCharge ? String(data.serviceCharge) : "");
      setDiscount(data.discount ? String(data.discount) : "");
      setBillTotal(data.total ? String(data.total) : "");
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
        billTotal: parseNumber(billTotal),
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
      <h1 className="mb-1 text-xl font-semibold">{session.restaurantName}</h1>
      <p className="mb-6 text-sm text-muted">Add the bill, then open voting.</p>

      <div className="space-y-3">
        <label className="flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-lg border border-line bg-white px-4 text-base">
          Upload bill photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={reading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              onPhoto(file);
            }}
          />
        </label>
        {reading ? <p className="text-sm text-muted">Reading bill...</p> : null}

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
            />
            <Field
              label="Quantity (optional)"
              inputMode="numeric"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
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
                    />
                    <Field
                      label="Qty (optional)"
                      inputMode="numeric"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
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
                      ₹{item.price} · qty {item.quantity}
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

      <div className="mt-6 space-y-3">
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
        <Field
          label="Bill total (₹)"
          inputMode="decimal"
          value={billTotal}
          onChange={(e) => setBillTotal(e.target.value)}
        />
      </div>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-6 space-y-3 pb-8">
        <PrimaryButton type="button" disabled={busy} onClick={openSession}>
          {busy ? "Opening…" : "Open session for voting"}
        </PrimaryButton>
        <button type="button" disabled={busy} onClick={removeSession} className="min-h-[42px] w-full text-sm text-red-700">
          Delete session
        </button>
      </div>
    </Screen>
  );
}
