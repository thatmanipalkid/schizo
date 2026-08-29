"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getIdentity } from "@/lib/identity";
import { formatRupee } from "@/lib/format";
import { computeSettlement } from "@/lib/settlement";
import {
  assignItem,
  deletePerson,
  reopenSession,
  setSessionStatus,
  splitUnclaimedItems,
} from "@/lib/sessionWrites";
import { useSessionLive } from "@/lib/useSessionLive";
import {
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusText,
} from "@/components/ui";
import type { Identity } from "@/lib/identity";

export default function SettlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, items, people, claims, loading, missing } = useSessionLive(id);
  const [identity, setIdentityState] = useState<Identity | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    setIdentityState(getIdentity(id));
  }, [id]);

  const result = useMemo(() => {
    if (!session) return null;
    return computeSettlement(session, items, people, claims, false);
  }, [session, items, people, claims]);

  if (loading) return <Screen><StatusText>Loading session…</StatusText></Screen>;
  if (missing || !session || !result) {
    return <Screen><StatusText>Session not found.</StatusText></Screen>;
  }
  if (session.status === "cancelled") {
    return <Screen><StatusText>This session was cancelled.</StatusText></Screen>;
  }
  if (session.status === "expired") {
    return <Screen><StatusText>This session has expired.</StatusText></Screen>;
  }

  const isHost = Boolean(identity?.isHost);
  const waiting = session.status === "open" && !isHost;
  const showResults = session.status === "calculating" || session.status === "settled";

  async function settle() {
    setBusy(true);
    try {
      await setSessionStatus(id, "calculating");
    } finally {
      setBusy(false);
    }
  }

  async function splitUnclaimed() {
    const claimantIds = Array.from(new Set(claims.map((c) => c.personId)));
    setBusy(true);
    try {
      await splitUnclaimedItems(
        id,
        result!.unclaimedItems.map((i) => i.id),
        claimantIds
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelSession() {
    setBusy(true);
    try {
      await setSessionStatus(id, "cancelled");
    } finally {
      setBusy(false);
    }
  }

  async function editSession() {
    setBusy(true);
    try {
      await reopenSession(id);
      router.push(`/session/${id}/host`);
    } finally {
      setBusy(false);
    }
  }

  async function removeParticipant(personId: string) {
    if (!window.confirm("Remove this person and their item selections?")) return;
    setBusy(true);
    try {
      await deletePerson(id, personId);
    } finally {
      setBusy(false);
    }
  }

  async function reallocateItem(itemId: string, personId: string) {
    if (!personId) return;
    setBusy(true);
    try {
      await assignItem(id, itemId, personId);
    } finally {
      setBusy(false);
    }
  }

  if (waiting) {
    return (
      <Screen>
        <StatusText>Waiting for the host to confirm everyone is in…</StatusText>
      </Screen>
    );
  }

  if (session.status === "draft") {
    return (
      <Screen>
        <StatusText>This session is not open yet.</StatusText>
      </Screen>
    );
  }

  return (
    <Screen>
      <h1 className="mb-1 text-xl font-semibold">{session.restaurantName}</h1>
      <p className="mb-6 text-sm text-muted">
        {session.status === "open"
          ? "Review who has joined, then confirm the split."
          : "Your calculated share is shown below."}
      </p>

      {isHost && session.status === "open" ? (
        <div className="mb-6 rounded-lg border border-line p-3">
          <p className="mb-2 text-sm font-medium">People in this session</p>
          <ul className="space-y-1 text-sm text-muted">
            {people.map((person) => (
              <li key={person.id} className="flex items-center justify-between gap-2">
                <span>{person.name}{person.isHost ? " (creator)" : ""}</span>
                {!person.isHost ? <button type="button" disabled={busy} onClick={() => removeParticipant(person.id)} className="text-red-700">Remove</button> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isHost && session.status === "open" ? (
        <div className="mb-6">
          <PrimaryButton type="button" disabled={busy} onClick={settle}>
            {busy ? "Confirming…" : "Everyone is in, show calculation"}
          </PrimaryButton>
        </div>
      ) : null}

      {showResults && result.hasUnclaimedMismatch && result.unclaimedTotal > 0 ? (
        <div className="mb-6 rounded-lg border border-line p-3">
          <p className="text-sm text-ink">
            {formatRupee(result.unclaimedTotal)} in items wasn&apos;t claimed by
            anyone
          </p>
          {isHost ? (
            <div className="mt-3 space-y-3">
              {result.unclaimedItems.map((item) => (
                <label key={item.id} className="block text-sm text-muted">
                  {item.name}
                  <select defaultValue="" disabled={busy || people.length === 0} onChange={(e) => reallocateItem(item.id, e.target.value)} className="mt-1 min-h-[42px] w-full rounded-lg border border-line bg-white px-3 text-sm text-ink">
                    <option value="">Assign to…</option>
                    {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                </label>
              ))}
              <SecondaryButton type="button" disabled={busy} onClick={splitUnclaimed}>
                Split all unallocated equally
              </SecondaryButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {showResults ? (
        <ul className="space-y-4">
          {result.breakdowns.map((row) => {
          return (
            <li key={row.personId} className="border-b border-line pb-4">
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-base font-medium">{row.name}</p>
                <p className="text-xl font-semibold">
                  {formatRupee(row.finalAmount)}
                </p>
              </div>
              <Row label="Items" value={formatRupee(row.itemSubtotal)} />
              <Row label="Tax" value={formatRupee(row.taxShare)} />
              <Row
                label="Service charge"
                value={formatRupee(row.serviceShare)}
              />
              <Row label="Discount" value={`−${formatRupee(row.discountShare)}`} />
            </li>
          );
          })}
        </ul>
      ) : null}

      {isHost ? (
        <div className="mt-8 pb-8">
          {showResults ? (
            <SecondaryButton type="button" disabled={busy} onClick={editSession}>
              Edit session and recalculate
            </SecondaryButton>
          ) : null}
          {confirmCancel ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">Cancel this session?</p>
              <SecondaryButton
                type="button"
                disabled={busy}
                onClick={cancelSession}
              >
                Yes, cancel session
              </SecondaryButton>
              <button
                type="button"
                className="min-h-[44px] w-full text-sm text-muted"
                onClick={() => setConfirmCancel(false)}
              >
                Keep session
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="min-h-[44px] w-full text-sm text-muted"
              onClick={() => setConfirmCancel(true)}
            >
              Cancel session
            </button>
          )}
        </div>
      ) : null}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-muted">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
