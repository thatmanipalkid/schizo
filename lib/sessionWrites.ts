import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { auth } from "./firebase";

export async function toggleClaim(
  sessionId: string,
  itemId: string,
  personId: string,
  existingClaimId?: string
) {
  const claimsRef = collection(db, "sessions", sessionId, "claims");
  if (existingClaimId) {
    await deleteDoc(doc(db, "sessions", sessionId, "claims", existingClaimId));
  } else {
    await addClaim(claimsRef, itemId, personId);
  }
}

async function addClaim(
  claimsRef: ReturnType<typeof collection>,
  itemId: string,
  personId: string
) {
  await writeBatch(db)
    .set(doc(claimsRef), { itemId, personId, shareFraction: 1 })
    .commit();
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
