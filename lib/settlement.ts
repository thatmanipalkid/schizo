import type { Claim, Item, Person, PersonBreakdown, Session, SettlementResult } from "./types";

export type PersonItemShare = {
  itemId: string;
  itemName: string;
  ways: number;
  amount: number;
};

function nonnegative(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function rounded(value: number) {
  return Math.round(nonnegative(value));
}

function claimsForItem(claims: Claim[], itemId: string) {
  return claims.filter((claim) => claim.itemId === itemId);
}

function uniqueValidClaims(people: Person[], claims: Claim[]) {
  const personIds = new Set(people.map((person) => person.id));
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = `${claim.itemId}:${claim.personId}`;
    if (!personIds.has(claim.personId) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function effectiveClaims(items: Item[], people: Person[], claims: Claim[], splitUnclaimedEqually: boolean) {
  const validClaims = uniqueValidClaims(people, claims);
  if (!splitUnclaimedEqually) return validClaims;
  const claimantIds = new Set(validClaims.map((claim) => claim.personId));
  if (claimantIds.size === 0) return validClaims;
  const extra: Claim[] = [];
  for (const item of items) {
    if (claimsForItem(validClaims, item.id).length > 0) continue;
    for (const personId of claimantIds) {
      extra.push({ id: `virtual-${item.id}-${personId}`, itemId: item.id, personId, shareFraction: 1 / claimantIds.size });
    }
  }
  return [...validClaims, ...extra];
}

export function computeSettlement(
  session: Pick<Session, "taxAmount" | "serviceChargeAmount" | "discountAmount" | "billTotal">,
  items: Item[],
  people: Person[],
  claims: Claim[],
  splitUnclaimedEqually = false
): SettlementResult {
  const workingClaims = effectiveClaims(items, people, claims, splitUnclaimedEqually);
  const sharesByPerson = new Map<string, PersonItemShare[]>();
  const subtotalByPerson = new Map<string, number>();
  people.forEach((person) => subtotalByPerson.set(person.id, 0));

  for (const item of items) {
    const itemClaims = claimsForItem(workingClaims, item.id);
    if (itemClaims.length === 0) continue;
    const amount = nonnegative(item.price) / itemClaims.length;
    for (const claim of itemClaims) {
      const shares = sharesByPerson.get(claim.personId) ?? [];
      shares.push({ itemId: item.id, itemName: item.name, ways: itemClaims.length, amount });
      sharesByPerson.set(claim.personId, shares);
      subtotalByPerson.set(claim.personId, (subtotalByPerson.get(claim.personId) ?? 0) + amount);
    }
  }

  const unclaimedItems = items.filter((item) => claimsForItem(workingClaims, item.id).length === 0);
  const unclaimedTotal = unclaimedItems.reduce((sum, item) => sum + nonnegative(item.price), 0);
  const allSubtotals = Array.from(subtotalByPerson.values()).reduce((sum, value) => sum + value, 0);
  const tax = nonnegative(session.taxAmount);
  const service = nonnegative(session.serviceChargeAmount);
  const discount = nonnegative(session.discountAmount);

  const breakdowns = people.map((person): PersonBreakdown => {
    const itemSubtotal = subtotalByPerson.get(person.id) ?? 0;
    const proportion = allSubtotals > 0 ? itemSubtotal / allSubtotals : 0;
    const taxShare = tax * proportion;
    const serviceShare = service * proportion;
    const discountShare = discount * proportion;
    const finalAmount = Math.max(0, itemSubtotal + taxShare + serviceShare - discountShare);
    return {
      personId: person.id,
      name: person.name,
      itemSubtotal: rounded(itemSubtotal),
      taxShare: rounded(taxShare),
      serviceShare: rounded(serviceShare),
      discountShare: rounded(discountShare),
      finalAmount: rounded(finalAmount),
      itemShares: sharesByPerson.get(person.id) ?? [],
    };
  });

  const sumRounded = breakdowns.reduce((sum, person) => sum + person.finalAmount, 0);
  const billTotal = nonnegative(session.billTotal);
  const leftover = billTotal - sumRounded;
  if (Math.abs(leftover) > 5) console.warn("Settlement leftover exceeds normal rounding tolerance", { leftover, billTotal, sumRounded });

  if (breakdowns.length > 0 && leftover !== 0) {
    const targetIndex = breakdowns.reduce((largest, person, index, all) => person.finalAmount > all[largest].finalAmount ? index : largest, 0);
    const target = breakdowns[targetIndex];
    const adjusted = target.finalAmount + leftover;
    if (adjusted >= 0) breakdowns[targetIndex] = { ...target, finalAmount: adjusted };
    else console.warn("Settlement leftover would make a person negative", { leftover, targetPersonId: target.personId });
  }

  const sumFinal = breakdowns.reduce((sum, person) => sum + person.finalAmount, 0);
  return {
    breakdowns,
    unclaimedItems,
    unclaimedTotal,
    sumFinal,
    billTotal,
    mismatch: billTotal - sumFinal,
    hasUnclaimedMismatch: unclaimedTotal > 2 || Math.abs(leftover) > 2,
  };
}

