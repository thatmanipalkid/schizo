"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { clearIdentity, getIdentity } from "@/lib/identity";
import { initials, formatRupee } from "@/lib/format";
import {
  deletePerson,
  optOutPerson,
  removeInactiveParticipants,
  setVotingDone,
  toggleClaim,
  updatePresence,
} from "@/lib/sessionWrites";
import { useSessionLive } from "@/lib/useSessionLive";
import { BackButton, Screen, StatusText } from "@/components/ui";
import type { Identity } from "@/lib/identity";

export default function VotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, items, people, claims, loading, missing } = useSessionLive(id);
  const [identity, setIdentityState] = useState<Identity | null>(null);
  const [checked, setChecked] = useState(false);
  const [pendingItem, setPendingItem] = useState<string | null>(null);
  const [pendingDone, setPendingDone] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    const me = getIdentity(id);
    if (!me) {
      router.replace(`/session/${id}/join`);
      return;
    }
    setIdentityState(me);
    setChecked(true);
  }, [id, router]);

  useEffect(() => {
    if (!identity || !session || session.status !== "open") return;
    const personId = identity.personId;
    const isHost = identity.isHost;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    let disconnectStarted = false;

    const heartbeat = () => {
      void updatePresence(id, personId).catch(() => undefined);
    };
    const removeAfterGrace = () => {
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = setTimeout(() => {
        if (!isHost) {
          clearIdentity(id);
          void deletePerson(id, personId).catch(() => undefined);
        }
      }, 10000);
    };
    const resume = () => {
      if (graceTimer) clearTimeout(graceTimer);
      heartbeat();
    };
    const onPageHide = () => {
      if (!isHost && !disconnectStarted) {
        disconnectStarted = true;
        clearIdentity(id);
        void deletePerson(id, personId).catch(() => undefined);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") removeAfterGrace();
      else resume();
    };

    heartbeat();
    const interval = window.setInterval(heartbeat, 5000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);

    return () => {
      window.clearInterval(interval);
      if (graceTimer) clearTimeout(graceTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
    };
  }, [id, identity, session]);

  useEffect(() => {
    if (identity?.isHost || loading || !identity || people.length === 0) return;
    if (!people.some((person) => person.id === identity.personId)) {
      clearIdentity(id);
      router.replace(`/session/${id}/join`);
    }
  }, [id, identity, loading, people, router]);

  useEffect(() => {
    if (!identity?.isHost || session?.status !== "open") return;
    const cleanup = () => {
      void removeInactiveParticipants(id).catch(() => undefined);
    };
    cleanup();
    const interval = window.setInterval(cleanup, 5000);
    return () => window.clearInterval(interval);
  }, [id, identity?.isHost, session?.status]);

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
  const doneCount = people.filter((person) => person.isDoneVoting).length;

  async function onToggle(itemId: string) {
    const me = identity && people.find((person) => person.id === identity.personId);
    if (!identity || !session || session.status === "settled") return;
    if (me?.isDoneVoting) {
      setInlineError("You marked yourself done. Toggle 'I'm done voting' off first to make changes.");
      window.setTimeout(() => setInlineError(""), 4000);
      return;
    }
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
      setInlineError("");
      await setVotingDone(id, me.id, !me.isDoneVoting);
    } finally {
      setPendingDone(false);
    }
  }

  async function leaveSession() {
    if (!identity) return;
    setPendingDone(true);
    try {
      await optOutPerson(id, identity.personId);
      clearIdentity(id);
      router.push("/");
    } finally {
      setPendingDone(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-white">
      <div className="px-4 pb-28 pt-6">
        <BackButton onClick={() => setConfirmLeave((current) => !current)} disabled={pendingDone} />
        {confirmLeave ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">
              Leave this session? You can rejoin with the same link.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={pendingDone}
                onClick={leaveSession}
                className="min-h-[42px] rounded-lg bg-red-700 px-3 text-sm font-medium text-white"
              >
                Leave session
              </button>
              <button
                type="button"
                disabled={pendingDone}
                onClick={() => setConfirmLeave(false)}
                className="min-h-[42px] rounded-lg border border-line bg-white px-3 text-sm text-ink"
              >
                Stay
              </button>
            </div>
          </div>
        ) : null}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{session.restaurantName}</h1>
            <p className="text-sm font-medium text-accent">
              Voting as: {me?.name || identity.name}
            </p>
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
        {inlineError ? (
          <p role="status" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {inlineError}
          </p>
        ) : null}

        {me?.isDoneVoting ? (
          <div className="mb-4 rounded-lg border border-accent bg-accent/5 px-3 py-2 text-sm text-accent">
            You&apos;re done voting ✓ Your selections are locked.
          </div>
        ) : null}

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

            const canEdit = !me?.isDoneVoting && pendingItem !== item.id;

            return (
              <li
                key={item.id}
                role="button"
                tabIndex={canEdit ? 0 : -1}
                aria-pressed={claimedByMe}
                aria-disabled={!canEdit}
                onClick={() => onToggle(item.id)}
                onKeyDown={(event) => {
                  if (canEdit && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onToggle(item.id);
                  }
                }}
                className={`rounded-lg border p-3 transition-colors ${
                  claimedByMe
                    ? "border-accent bg-accent/5"
                    : "border-line bg-white"
                } ${canEdit ? "cursor-pointer" : "cursor-default opacity-75"}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                      claimedByMe
                        ? "border-accent bg-accent text-white"
                        : "border-line bg-white text-transparent"
                    }`}
                  >
                    ✓
                  </span>
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
        <section className="mt-6 rounded-lg border border-line p-3">
          <h2 className="mb-2 text-sm font-medium">You&apos;ve selected:</h2>
          {items.some((item) => claims.some(
            (claim) => claim.itemId === item.id && claim.personId === identity.personId
          )) ? (
            <ul className="space-y-2 text-sm text-muted">
              {items.map((item) => {
                const selected = claims.some(
                  (claim) => claim.itemId === item.id && claim.personId === identity.personId
                );
                if (!selected) return null;
                const ways = claims.filter((claim) => claim.itemId === item.id).length;
                return (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{item.name}</span>
                    <span className="shrink-0">{formatRupee(ways ? item.price / ways : 0)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing selected yet.</p>
          )}
        </section>
        <button
          type="button"
          disabled={pendingDone}
          onClick={onDone}
          className={`mt-6 min-h-[42px] w-full rounded-lg px-4 text-sm font-medium ${
            me?.isDoneVoting ? "border border-accent bg-white text-accent" : "bg-accent text-white"
          }`}
        >
          {me?.isDoneVoting ? "I'm done voting ✓ (tap to edit)" : "I'm done voting"}
        </button>
      </div>

    </div>
  );
}
