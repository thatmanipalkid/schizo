export type Identity = {
  personId: string;
  isHost: boolean;
  name: string;
};

const key = (sessionId: string) => `thatmanipalkid:session:${sessionId}`;

export function getIdentity(sessionId: string): Identity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Identity;
    if (!parsed?.personId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setIdentity(sessionId: string, identity: Identity) {
  localStorage.setItem(key(sessionId), JSON.stringify(identity));
}
