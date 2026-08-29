export type SessionStatus =
  | "draft"
  | "open"
  | "calculating"
  | "settled"
  | "expired"
  | "cancelled";

export type SessionDoc = {
  restaurantName: string;
  createdAt: unknown;
  expiresAt: unknown;
  status: SessionStatus;
  hostUid: string;
  taxAmount: number;
  serviceChargeAmount: number;
  discountAmount: number;
  billTotal: number;
};

export type ItemDoc = {
  name: string;
  price: number;
  quantity?: number;
};

export type PersonDoc = {
  name: string;
  joinedAt: unknown;
  isHost: boolean;
  authUid?: string;
};

export type ClaimDoc = {
  itemId: string;
  personId: string;
  shareFraction: number;
};

export type Session = SessionDoc & { id: string };
export type Item = ItemDoc & { id: string };
export type Person = PersonDoc & { id: string };
export type Claim = ClaimDoc & { id: string };

export type PersonBreakdown = {
  personId: string;
  name: string;
  itemSubtotal: number;
  taxShare: number;
  serviceShare: number;
  discountShare: number;
  finalAmount: number;
};

export type SettlementResult = {
  breakdowns: PersonBreakdown[];
  unclaimedItems: Item[];
  unclaimedTotal: number;
  sumFinal: number;
  billTotal: number;
  mismatch: number;
  hasUnclaimedMismatch: boolean;
};
