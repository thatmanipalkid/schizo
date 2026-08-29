"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getIdentity } from "@/lib/identity";
import { initials, formatRupee } from "@/lib/format";
import { setVotingDone, toggleClaim } from "@/lib/sessionWrites";
import { useSessionLive } from "@/lib/useSessionLive";
import { Screen, StatusText } from "@/components/ui";
import type { Identity } from "@/lib/identity";

export default function VotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, items, people, claims, loading, missing } = useSessionLive(id);
  const [identity, setIdentityState] = useState<Identity | null>(null);
  const [checked, setChecked] = useState(false);
  const [pendingItem, setPendingItem] = useState<string | null>(null);
  const [pendingDone, setPendingDone] = useState(false);

  useEffect(() => {
    const me = getIdentity(id);
    if (!me) {
      router.replace(`/session/${id}/join`);
      return;
    }
    setIdentityState(me);
    setChecked(true);
  }, [id, router]);

  if (loading || !checked) {
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
  if (!identity) {
    return <Screen><StatusText>Joining…</StatusText></Screen>;
  }

  const me = people.find((person) => person.id === identity.personId);
  const doneCount = people.filter((person) => person.votingDone).length;

  async function onToggle(itemId: string) {
    const me = identity && people.find((person) => person.id === identity.personId);
    if (!identity || !session || session.status === "settled" || me?.votingDone) return;
    const existing = claims.find(
      (c) => c.itemId === itemId && c.personId === identity.personId
    );
    setPendingItem(itemId);
    try {
      await toggleClaim(id, itemId, identity.personId, existing?.id);
    } finally {
      setPendingItem(null);
    }
  }

  async function onDone() {
    if (!identity) return;
    const me = people.find((person) => person.id === identity.personId);
    if (!me) return;
    setPendingDone(true);
    try {
      await setVotingDone(id, me.id, !me.votingDone);
    } finally {
      setPendingDone(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-white">
      <div className="px-4 pb-28 pt-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{session.restaurantName}</h1>
            <p className="text-sm text-muted">
              {people.length} {people.length === 1 ? "person" : "people"} joined
            </p>
            <p className="text-sm text-muted">{doneCount} of {people.length} done voting</p>
          </div>
          {identity.isHost ? (
            <Link
              href={`/session/${id}/settle`}
              className="flex min-h-[44px] items-center rounded-lg bg-accent px-3 text-sm font-medium text-white"
            >
              Review people
            </Link>
          ) : null}
        </div>

        <ul className="space-y-3">
          {items.map((item) => {
            const itemClaims = claims.filter((c) => c.itemId === item.id);
            const n = itemClaims.length;
            const claimedByMe = itemClaims.some(
              (c) => c.personId === identity.personId
            );
            const claimers = itemClaims
              .map((c) => people.find((p) => p.id === c.personId))
              .filter(Boolean);
            const each = n > 0 ? item.price / n : 0;

            return (
              <li key={item.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label={claimedByMe ? `Remove ${item.name}` : `Select ${item.name}`}
                    disabled={pendingItem === item.id || Boolean(me?.votingDone)}
                    onClick={() => onToggle(item.id)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                      claimedByMe
                        ? "border-accent bg-accent text-white"
                        : "border-line bg-white text-transparent"
                    }`}
                  >
                    ✓
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-base font-semibold">{formatRupee(item.price)}</p>
                  </div>
                </div>
                {claimers.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {claimers.map((p) => (
                      <span
                        key={p!.id}
                        className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-neutral-100 px-2 text-xs text-ink"
                      >
                        {initials(p!.name)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">No one yet</p>
                )}
                {n > 1 ? (
                  <p className="mt-1 text-sm text-muted">
                    Split {n} ways · {formatRupee(each)} each
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          disabled={pendingDone}
          onClick={onDone}
          className={`mt-6 min-h-[42px] w-full rounded-lg px-4 text-sm font-medium ${
            me?.votingDone ? "border border-accent bg-white text-accent" : "bg-accent text-white"
          }`}
        >
          {me?.votingDone ? "Edit my votes" : "I am done voting"}
        </button>
      </div>

    </div>
  );
}
