export type Identity = {
  personId: string;
  isHost: boolean;
  name: string;
};

const key = (sessionId: string) => `thatmanipalkid:session:${sessionId}`;

function storage() {
  return window.sessionStorage;
}

export function getIdentity(sessionId: string): Identity | null {
  if (typeof window === "undefined") return null;
  try {
    window.localStorage.removeItem(key(sessionId));
    const raw = storage().getItem(key(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Identity;
    if (!parsed?.personId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setIdentity(sessionId: string, identity: Identity) {
  storage().setItem(key(sessionId), JSON.stringify(identity));
}

export function clearIdentity(sessionId: string) {
  storage().removeItem(key(sessionId));
}
