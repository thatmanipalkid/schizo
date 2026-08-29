import type {
  Claim,
  Item,
  Person,
  PersonBreakdown,
  Session,
  SettlementResult,
} from "./types";

function roundRupee(n: number) {
  return Math.round(n);
}

function claimsForItem(claims: Claim[], itemId: string) {
  return claims.filter((c) => c.itemId === itemId);
}

function fractionForClaim(claim: Claim, claims: Claim[]) {
  const itemClaims = claimsForItem(claims, claim.itemId);
  return itemClaims.length > 0 ? 1 / itemClaims.length : 0;
}

function peopleWithClaims(people: Person[], claims: Claim[]) {
  const ids = new Set(claims.map((c) => c.personId));
  return people.filter((p) => ids.has(p.id));
}

function effectiveClaims(
  items: Item[],
  people: Person[],
  claims: Claim[],
  splitUnclaimedEqually: boolean
): Claim[] {
  if (!splitUnclaimedEqually) return claims;

  const claimants = peopleWithClaims(people, claims);
  if (claimants.length === 0) return claims;

  const extra: Claim[] = [];
  for (const item of items) {
    const totalShare = claimsForItem(claims, item.id).reduce(
      (sum, c) => sum + c.shareFraction,
      0
    );
    if (totalShare > 0) continue;
    const fraction = 1 / claimants.length;
    for (const person of claimants) {
      extra.push({
        id: `virtual-${item.id}-${person.id}`,
        itemId: item.id,
        personId: person.id,
        shareFraction: fraction,
      });
    }
  }
  return [...claims, ...extra];
}

export function computeSettlement(
  session: Pick<
    Session,
    "taxAmount" | "serviceChargeAmount" | "discountAmount" | "billTotal"
  >,
  items: Item[],
  people: Person[],
  claims: Claim[],
  splitUnclaimedEqually = false
): SettlementResult {
  const workingClaims = effectiveClaims(
    items,
    people,
    claims,
    splitUnclaimedEqually
  );

  const unclaimedItems = items.filter((item) => {
    const totalShare = claimsForItem(workingClaims, item.id).reduce(
      (sum, c) => sum + c.shareFraction,
      0
    );
    return totalShare === 0;
  });
  const unclaimedTotal = unclaimedItems.reduce((sum, item) => sum + item.price, 0);

  const rawByPerson = new Map<string, number>();
  for (const person of people) {
    rawByPerson.set(person.id, 0);
  }
  for (const claim of workingClaims) {
    const item = items.find((i) => i.id === claim.itemId);
    if (!item) continue;
    const prev = rawByPerson.get(claim.personId) ?? 0;
    rawByPerson.set(
      claim.personId,
      prev + item.price * fractionForClaim(claim, workingClaims)
    );
  }

  const claimants = peopleWithClaims(people, workingClaims);
  const sumRaw = claimants.reduce(
    (sum, p) => sum + (rawByPerson.get(p.id) ?? 0),
    0
  );

  const unrounded: PersonBreakdown[] = people.map((person) => {
    const itemSubtotal = rawByPerson.get(person.id) ?? 0;
    const hasClaim = claimants.some((p) => p.id === person.id);
    const share = hasClaim && sumRaw > 0 ? itemSubtotal / sumRaw : 0;
    const taxShare = session.taxAmount * share;
    const serviceShare = session.serviceChargeAmount * share;
    const discountShare = session.discountAmount * share;
    const finalAmount =
      itemSubtotal + taxShare + serviceShare - discountShare;
    return {
      personId: person.id,
      name: person.name,
      itemSubtotal,
      taxShare,
      serviceShare,
      discountShare,
      finalAmount,
    };
  });

  const withClaims = unrounded.filter((b) =>
    claimants.some((p) => p.id === b.personId)
  );
  const withoutClaims = unrounded.filter(
    (b) => !claimants.some((p) => p.id === b.personId)
  );

  const rounded = withClaims.map((b) => ({
    ...b,
    itemSubtotal: roundRupee(b.itemSubtotal),
    taxShare: roundRupee(b.taxShare),
    serviceShare: roundRupee(b.serviceShare),
    discountShare: roundRupee(b.discountShare),
    finalAmount: roundRupee(b.finalAmount),
  }));

  const sumRounded = rounded.reduce((sum, b) => sum + b.finalAmount, 0);
  const leftover = session.billTotal - sumRounded;
  const hasUnclaimedMismatch = unclaimedTotal > 2 || Math.abs(leftover) > 2;

  if (rounded.length > 0 && !Number.isNaN(leftover)) {
    let targetIndex = 0;
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i].finalAmount > rounded[targetIndex].finalAmount) {
        targetIndex = i;
      }
    }
    rounded[targetIndex] = {
      ...rounded[targetIndex],
      finalAmount: rounded[targetIndex].finalAmount + leftover,
    };
  }

  const breakdowns = [
    ...rounded,
    ...withoutClaims.map((b) => ({
      ...b,
      itemSubtotal: 0,
      taxShare: 0,
      serviceShare: 0,
      discountShare: 0,
      finalAmount: 0,
    })),
  ];

  const sumFinal = breakdowns.reduce((sum, b) => sum + b.finalAmount, 0);

  return {
    breakdowns,
    unclaimedItems,
    unclaimedTotal,
    sumFinal,
    billTotal: session.billTotal,
    mismatch: session.billTotal - sumFinal,
    hasUnclaimedMismatch,
  };
}

export function personRunningTotal(
  personId: string,
  items: Item[],
  claims: Claim[]
) {
  const mine = claims.filter((c) => c.personId === personId);
  return mine.reduce((sum, claim) => {
    const item = items.find((i) => i.id === claim.itemId);
    if (!item) return sum;
    return sum + item.price * claim.shareFraction;
  }, 0);
}
