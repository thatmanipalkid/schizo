"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
} from "firebase/firestore";
import { db, ensureAnonymousAuth } from "./firebase";
import type { Claim, Item, Person, Session, SessionStatus } from "./types";

function num(v: unknown, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function useSessionLive(sessionId: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void ensureAnonymousAuth().then(() => {
      if (!active) return;
      const sessionRef = doc(db, "sessions", sessionId);

      const unsubSession = onSnapshot(sessionRef, (snap) => {
        if (!snap.exists()) {
          setMissing(true);
          setSession(null);
          setLoading(false);
          return;
        }
        setMissing(false);
        const d = snap.data();
        const expiresAt = d.expiresAt;
        const expired =
          (d.status === "draft" || d.status === "open") &&
          expiresAt?.toMillis && expiresAt.toMillis() <= Date.now();
        setSession({
          id: snap.id,
          restaurantName: String(d.restaurantName ?? "Untitled Session"),
          createdAt: d.createdAt,
          expiresAt: d.expiresAt,
          status: expired ? "expired" : ((d.status as SessionStatus) ?? "draft"),
          hostUid: String(d.hostUid ?? ""),
          taxAmount: num(d.taxAmount),
          serviceChargeAmount: num(d.serviceChargeAmount),
          discountAmount: num(d.discountAmount),
          billTotal: num(d.billTotal),
        });
        setLoading(false);
      });

      const unsubItems = onSnapshot(collection(db, "sessions", sessionId, "items"), (snap) => {
        setItems(snap.docs.map((d) => ({
          id: d.id,
          name: String(d.data().name ?? ""),
          price: num(d.data().price),
          quantity: d.data().quantity == null ? undefined : num(d.data().quantity),
        })));
      });

      const unsubPeople = onSnapshot(collection(db, "sessions", sessionId, "people"), (snap) => {
        setPeople(snap.docs.map((d) => ({
          id: d.id,
          name: String(d.data().name ?? ""),
          joinedAt: d.data().joinedAt,
          isHost: Boolean(d.data().isHost),
          authUid: d.data().authUid ? String(d.data().authUid) : undefined,
          votingDone: Boolean(d.data().votingDone),
        })));
      });

      const unsubClaims = onSnapshot(collection(db, "sessions", sessionId, "claims"), (snap) => {
        setClaims(snap.docs.map((d) => ({
          id: d.id,
          itemId: String(d.data().itemId ?? ""),
          personId: String(d.data().personId ?? ""),
          shareFraction: num(d.data().shareFraction, 1),
        })));
      });

      unsubscribe = () => {
        unsubSession();
        unsubItems();
        unsubPeople();
        unsubClaims();
      };
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [sessionId]);

  return { session, items, people, claims, loading, missing };
}
