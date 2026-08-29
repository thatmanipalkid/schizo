import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export async function updatePresence(sessionId: string, personId: string) {
  await updateDoc(doc(db, "sessions", sessionId, "people", personId), {
    lastSeen: new Date(),
  });
}

export async function setVotingDone(
  sessionId: string,
  personId: string,
  isDoneVoting: boolean
) {
  await updateDoc(doc(db, "sessions", sessionId, "people", personId), {
    isDoneVoting,
  });
}

export async function toggleClaim(
  sessionId: string,
  itemId: string,
  personId: string,
  existingClaimId?: string
) {
  const claimRef = doc(
    db,
    "sessions",
    sessionId,
    "claims",
    `${personId}_${itemId}`
  );
  if (existingClaimId) {
    await deleteDoc(doc(db, "sessions", sessionId, "claims", existingClaimId));
  } else {
    await setDoc(claimRef, { itemId, personId, shareFraction: 1 });
  }
}

export async function splitUnclaimedItems(
  sessionId: string,
  unclaimedItemIds: string[],
  claimantPersonIds: string[]
) {
  if (unclaimedItemIds.length === 0 || claimantPersonIds.length === 0) return;
  const fraction = 1 / claimantPersonIds.length;
  const batch = writeBatch(db);
  const claimsRef = collection(db, "sessions", sessionId, "claims");
  for (const itemId of unclaimedItemIds) {
    for (const personId of claimantPersonIds) {
      const ref = doc(claimsRef);
      batch.set(ref, {
        itemId,
        personId,
        shareFraction: fraction,
      });
    }
  }
  await batch.commit();
}

export async function setSessionStatus(
  sessionId: string,
  status: "open" | "calculating" | "settled" | "cancelled"
) {
  await updateDoc(doc(db, "sessions", sessionId), { status });
}

export async function deleteSession(sessionId: string) {
  const sessionRef = doc(db, "sessions", sessionId);
  const batch = writeBatch(db);
  for (const subcollection of ["items", "people", "claims"]) {
    const snap = await getDocs(collection(db, "sessions", sessionId, subcollection));
    snap.docs.forEach((entry) => batch.delete(entry.ref));
  }
  batch.delete(sessionRef);
  await batch.commit();
}

export async function deletePerson(sessionId: string, personId: string) {
  const claims = await getDocs(
    query(collection(db, "sessions", sessionId, "claims"), where("personId", "==", personId))
  );
  const batch = writeBatch(db);
  claims.docs.forEach((claim) => batch.delete(claim.ref));
  batch.delete(doc(db, "sessions", sessionId, "people", personId));
  await batch.commit();
}

export async function optOutPerson(sessionId: string, personId: string) {
  const items = await getDocs(collection(db, "sessions", sessionId, "items"));
  const people = await getDocs(collection(db, "sessions", sessionId, "people"));
  const claims = await getDocs(collection(db, "sessions", sessionId, "claims"));
  const remainingClaims = claims.docs.filter(
    (claim) => claim.data().personId !== personId
  );
  const remainingClaimants = new Set(
    remainingClaims.map((claim) => String(claim.data().personId))
  );
  const claimantIds = Array.from(remainingClaimants);
  const batch = writeBatch(db);

  claims.docs
    .filter((claim) => claim.data().personId === personId)
    .forEach((claim) => batch.delete(claim.ref));
  batch.delete(doc(db, "sessions", sessionId, "people", personId));

  if (claimantIds.length > 0) {
    for (const item of items.docs) {
      const hasClaim = remainingClaims.some(
        (claim) => claim.data().itemId === item.id
      );
      if (hasClaim) continue;
      const fraction = 1 / claimantIds.length;
      for (const claimantId of claimantIds) {
        batch.set(doc(collection(db, "sessions", sessionId, "claims")), {
          itemId: item.id,
          personId: claimantId,
          shareFraction: fraction,
        });
      }
    }
  }
  await batch.commit();
}

export async function removeInactiveParticipants(
  sessionId: string,
  gracePeriodMs = 12000
) {
  const people = await getDocs(collection(db, "sessions", sessionId, "people"));
  const cutoff = Date.now() - gracePeriodMs;
  const inactiveIds = people.docs
    .filter((person) => {
      if (person.data().isHost || !person.data().lastSeen) return false;
      const lastSeen = person.data().lastSeen;
      const timestamp = typeof lastSeen.toMillis === "function"
        ? lastSeen.toMillis()
        : new Date(lastSeen).getTime();
      return Number.isFinite(timestamp) && timestamp < cutoff;
    })
    .map((person) => person.id);

  await Promise.all(inactiveIds.map((personId) => deletePerson(sessionId, personId)));
}

export async function deleteItemAndClaims(sessionId: string, itemId: string) {
  const claims = await getDocs(
    query(collection(db, "sessions", sessionId, "claims"), where("itemId", "==", itemId))
  );
  const batch = writeBatch(db);
  claims.docs.forEach((claim) => batch.delete(claim.ref));
  batch.delete(doc(db, "sessions", sessionId, "items", itemId));
  await batch.commit();
}

export async function reopenSession(sessionId: string) {
  const claims = await getDocs(collection(db, "sessions", sessionId, "claims"));
  const batch = writeBatch(db);
  claims.docs.forEach((claim) => batch.delete(claim.ref));
  batch.update(doc(db, "sessions", sessionId), { status: "draft" });
  await batch.commit();
}

export async function assignItem(
  sessionId: string,
  itemId: string,
  personId: string
) {
  const claims = await getDocs(
    query(collection(db, "sessions", sessionId, "claims"), where("itemId", "==", itemId))
  );
  const batch = writeBatch(db);
  claims.docs.forEach((claim) => batch.delete(claim.ref));
  batch.set(doc(collection(db, "sessions", sessionId, "claims")), {
    itemId,
    personId,
    shareFraction: 1,
  });
  await batch.commit();
}
