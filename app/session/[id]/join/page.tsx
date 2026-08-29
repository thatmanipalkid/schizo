"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, ensureAnonymousAuth } from "@/lib/firebase";
import { getIdentity, setIdentity, type Identity } from "@/lib/identity";
import { useSessionLive } from "@/lib/useSessionLive";
import {
  Field,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusText,
} from "@/components/ui";

export default function JoinPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, loading, missing } = useSessionLive(id);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Identity | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    const identity = getIdentity(id);
    if (identity && !identity.isHost) {
      router.replace(`/session/${id}/vote`);
      return;
    }
    setMe(identity);
    setReady(true);
  }, [id, router]);

  const voteUrl = origin ? `${origin}/session/${id}/vote` : "";

  if (loading || !ready) {
    return <Screen><StatusText>Loading session…</StatusText></Screen>;
  }
  if (missing || !session) {
    return <Screen><StatusText>Session not found.</StatusText></Screen>;
  }
  if (session.status === "cancelled") {
    return <Screen><StatusText>This session was cancelled.</StatusText></Screen>;
  }
  if (session.status === "expired") {
    return <Screen><StatusText>This session has expired.</StatusText></Screen>;
  }
  if (session.status === "draft") {
    return (
      <Screen>
        <StatusText>Waiting for the host to open this session…</StatusText>
      </Screen>
    );
  }
  if (session.status === "calculating" || session.status === "settled") {
    router.replace(`/session/${id}/settle`);
    return <Screen><StatusText>Opening the calculation…</StatusText></Screen>;
  }

  async function copyLink() {
    if (!voteUrl) return;
    await navigator.clipboard.writeText(voteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const user = await ensureAnonymousAuth();
      const personRef = await addDoc(collection(db, "sessions", id, "people"), {
        name: trimmed,
        joinedAt: serverTimestamp(),
        isHost: false,
        authUid: user.uid,
      });
      setIdentity(id, {
        personId: personRef.id,
        isHost: false,
        name: trimmed,
      });
      router.push(`/session/${id}/vote`);
    } catch {
      setError("Could not join. Try again.");
      setBusy(false);
    }
  }

  return (
    <Screen>
      <h1 className="mb-1 text-xl font-semibold">{session.restaurantName}</h1>
      <p className="mb-6 text-sm text-muted">Scan or share the link to join.</p>

      <div className="flex justify-center py-4">
        {voteUrl ? (
          <QRCodeSVG value={voteUrl} size={220} bgColor="#FFFFFF" fgColor="#171717" />
        ) : null}
      </div>

      <p className="break-all text-center text-sm text-muted">{voteUrl}</p>
      <div className="mt-3">
        <SecondaryButton type="button" onClick={copyLink}>
          {copied ? "Copied" : "Copy link"}
        </SecondaryButton>
      </div>

      {me?.isHost ? (
        <div className="mt-8">
          <PrimaryButton
            type="button"
            onClick={() => router.push(`/session/${id}/vote`)}
          >
            Continue to voting
          </PrimaryButton>
        </div>
      ) : (
        <form onSubmit={join} className="mt-8 space-y-3">
          <Field
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <PrimaryButton type="submit" disabled={busy || !name.trim()}>
            {busy ? "Joining…" : "Join session"}
          </PrimaryButton>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </form>
      )}
    </Screen>
  );
}
