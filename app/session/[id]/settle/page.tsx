"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { clearIdentity, getIdentity } from "@/lib/identity";
import { formatRupee } from "@/lib/format";
import { computeSettlement } from "@/lib/settlement";
import {
  assignItem,
  deletePerson,
  optOutPerson,
  reopenSession,
  setSessionStatus,
  splitUnclaimedItems,
} from "@/lib/sessionWrites";
import { useSessionLive } from "@/lib/useSessionLive";
import {
  PrimaryButton,
  Screen,
  BackButton,
  SecondaryButton,
  StatusText,
} from "@/components/ui";
import type { Identity } from "@/lib/identity";
import type { PersonBreakdown } from "@/lib/types";

export default function SettlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, items, people, claims, loading, missing } = useSessionLive(id);
  const [identity, setIdentityState] = useState<Identity | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmOptOut, setConfirmOptOut] = useState(false);

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
  const doneCount = people.filter((person) => person.isDoneVoting).length;
  const everyoneDone = people.length > 0 && doneCount === people.length;
  const currentPerson = identity
    ? result.breakdowns.find((person) => person.personId === identity.personId)
    : null;
  const otherPeople = result.breakdowns.filter(
    (person) => person.personId !== identity?.personId
  );

  async function settle() {
    if (!everyoneDone) return;
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

  async function optOut() {
    if (!identity) return;
    setBusy(true);
    try {
      await optOutPerson(id, identity.personId);
      clearIdentity(id);
      router.push(`/session/${id}/left`);
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

  function goBack() {
    if (session?.status === "open") router.push(`/session/${id}/vote`);
  }

  if (waiting) {
    return (
      <Screen>
        <BackButton onClick={goBack} />
        <StatusText>Waiting for the host to confirm everyone is in…</StatusText>
      </Screen>
    );
  }

  if (session.status === "draft") {
    return (
      <Screen>
        <BackButton onClick={() => router.push(`/session/${id}/host`)} />
        <StatusText>This session is not open yet.</StatusText>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton onClick={goBack} disabled={session.status !== "open"} />
      {session.status !== "open" ? (
        <p className="-mt-3 mb-5 text-sm text-muted">Session already settled.</p>
      ) : null}
      <h1 className="mb-1 text-xl font-semibold">{session.restaurantName}</h1>
        <p className="mb-2 text-sm font-semibold text-accent">
          Computed total: {formatRupee(result.billTotal)}
        </p>
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
          <p className="mb-2 text-sm text-muted">
            {doneCount} of {people.length} people are done voting.
          </p>
          <PrimaryButton type="button" disabled={busy || !everyoneDone} onClick={settle}>
            {busy
              ? "Confirming…"
              : everyoneDone
                ? "Everyone is done, show calculation"
                : "Waiting for everyone to finish"}
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
                  <select defaultValue="" disabled={busy || people.length === 0} onChange={(e) => reallocateItem(item.id, e.target.value)} className="mt-1 min-h-[42px] w-full rounded-lg border border-line bg-white px-3 text-base text-ink">
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
        <>
          {currentPerson ? <PersonalBreakdown person={currentPerson} /> : null}
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-medium text-muted">Everyone else</h2>
            <ul className="divide-y divide-line border-y border-line">
              {otherPeople.map((person) => (
                <li key={person.personId} className="flex justify-between py-3 text-sm">
                  <span>{person.name} pays</span>
                  <strong>{formatRupee(person.finalAmount)}</strong>
                </li>
              ))}
            </ul>
          </section>
          <ItemSplitDetails items={items} people={people} claims={claims} />
          {isHost ? (
            <section className="mt-8 rounded-lg border-2 border-accent bg-accent/5 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold">Total from everyone</h2>
                <p className="text-xl font-semibold text-accent">
                  {formatRupee(result.sumFinal)}
                </p>
              </div>
              <p className="mt-1 text-xs text-muted">
                Sum of all displayed participant amounts.
              </p>
            </section>
          ) : null}
        </>
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

      {identity ? (
        <div className="mt-8 border-t border-line pt-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmOptOut((current) => !current)}
            className="min-h-[42px] w-full text-sm text-red-700"
          >
            Opt out of this session
          </button>
          {confirmOptOut ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">
                Are you sure? This removes you from the split.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={optOut}
                  className="min-h-[42px] rounded-lg bg-red-700 px-3 text-sm font-medium text-white"
                >
                  Confirm
                </button>
                <SecondaryButton
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmOptOut(false)}
                >
                  Cancel
                </SecondaryButton>
              </div>
            </div>
          ) : null}
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

function PersonalBreakdown({ person }: { person: PersonBreakdown }) {
  const itemTotal = person.itemShares.reduce((sum, item) => sum + Math.round(item.amount), 0);
  const displayedTotal = itemTotal + person.taxShare + person.serviceShare - person.discountShare;
  const roundingAdjustment = person.finalAmount - displayedTotal;

  return (
    <section className="rounded-lg border-2 border-[#8CCAA2] bg-[#EEF9F1] p-4 shadow-sm">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#1D5E46]">
          {person.name}, you pay {formatRupee(person.finalAmount)}
        </h2>
      </div>
      <ul className="space-y-2 border-t border-[#CFEAD9] pt-3 text-sm text-[#1D5E46]">
        {person.itemShares.map((item) => (
          <li key={item.itemId} className="flex justify-between gap-3">
            <span>{item.itemName} (split {item.ways} ways)</span>
            <span>{formatRupee(item.amount)}</span>
          </li>
        ))}
        <Row label="Tax" value={formatRupee(person.taxShare)} />
        <Row label="Service charge" value={formatRupee(person.serviceShare)} />
        <Row label="Discount" value={`−${formatRupee(person.discountShare)}`} />
        {roundingAdjustment !== 0 ? (
          <Row
            label="Rounding adjustment"
            value={`${roundingAdjustment > 0 ? "+" : "−"}${formatRupee(Math.abs(roundingAdjustment))}`}
          />
        ) : null}
      </ul>
    </section>
  );
}

function ItemSplitDetails({
  items,
  people,
  claims,
}: {
  items: { id: string; name: string }[];
  people: { id: string; name: string }[];
  claims: { itemId: string; personId: string }[];
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-medium text-muted">Items split by</h2>
      <ul className="divide-y divide-line border-y border-line">
        {items.map((item) => {
          const names = Array.from(
            new Set(
              claims
                .filter((claim) => claim.itemId === item.id)
                .map((claim) => people.find((person) => person.id === claim.personId)?.name)
                .filter((name): name is string => Boolean(name))
            )
          );
          return (
            <li key={item.id} className="py-3 text-sm">
              <p className="font-medium">{item.name}</p>
              <p className="mt-1 text-muted">
                {names.length > 0 ? names.join(", ") : "Unallocated"}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
