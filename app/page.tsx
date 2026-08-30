"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, ensureAnonymousAuth } from "@/lib/firebase";
import { setIdentity } from "@/lib/identity";
import { Field, PrimaryButton, Screen, BrandHeader } from "@/components/ui";

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setBusy(true);
    setError("");
    try {
      const user = await ensureAnonymousAuth();
      const sessionRef = await addDoc(collection(db, "sessions"), {
        restaurantName: restaurantName.trim() || "Untitled Session",
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        status: "draft",
        hostUid: user.uid,
        taxAmount: 0,
        serviceChargeAmount: 0,
        discountAmount: 0,
        billTotal: 0,
      });

      const personRef = await addDoc(
        collection(db, "sessions", sessionRef.id, "people"),
        {
          name: trimmedName,
          joinedAt: serverTimestamp(),
          isHost: true,
          authUid: user.uid,
          isDoneVoting: false,
          lastSeen: new Date(),
        }
      );

      setIdentity(sessionRef.id, {
        personId: personRef.id,
        isHost: true,
        name: trimmedName,
      });

      router.push(`/session/${sessionRef.id}/host`);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(
        code.includes("auth/configuration-not-found")
          ? "Firebase Authentication is not enabled. In Firebase Console, open Authentication, click Get started, enable Anonymous sign-in, and try again."
          : err instanceof Error && err.message
            ? err.message
            : "Could not start a session. Try again."
      );
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BrandHeader />
      <h1 className="mb-8 text-3xl font-semibold">Split the bill simply.</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Your name"
          placeholder="e.g. Aditi"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Restaurant name"
          placeholder="Untitled Session"
          value={restaurantName}
          onChange={(e) => setRestaurantName(e.target.value)}
        />
        <PrimaryButton type="submit" disabled={busy || !name.trim()}>
          {busy ? "Starting…" : "Start a session"}
        </PrimaryButton>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </form>
    </Screen>
  );
}
