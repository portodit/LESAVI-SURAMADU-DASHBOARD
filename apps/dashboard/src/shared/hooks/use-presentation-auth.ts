const STORAGE_KEY = "presentation_auth_v1";
const EXPIRY_DAYS = 365;

export interface PresentationSession {
  nik: string;
  namaAm: string;
  expires: string;
}

export function getPresentationSession(): PresentationSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: PresentationSession = JSON.parse(raw);
    if (new Date(session.expires) < new Date()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function storePresentationSession(nik: string, namaAm: string): void {
  const expires = new Date();
  expires.setDate(expires.getDate() + EXPIRY_DAYS);
  const session: PresentationSession = { nik, namaAm, expires: expires.toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearPresentationSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
