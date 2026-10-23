// Server-side reads for link previews (WhatsApp, Instagram, etc.). Runs inside the Next server,
// talks to the API directly, and never counts as a customer "view".
import type { PublicAppointment, PublicLinkPage, PublicQuote, PublicService } from "./types";

const API = process.env.API_URL || "http://localhost:8000";

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}/api${path}`, { next: { revalidate: 60 } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export const fetchQuote = (token: string) => get<PublicQuote>(`/public/q/${encodeURIComponent(token)}?preview=1`);
export const fetchLinkPage = (slug: string) => get<PublicLinkPage>(`/public/b/${encodeURIComponent(slug)}?preview=1`);
export const fetchAppointment = (token: string) => get<PublicAppointment>(`/public/a/${encodeURIComponent(token)}`);
export const fetchService = (token: string) => get<PublicService>(`/public/s/${encodeURIComponent(token)}`);

export function aed(v: string | number, cur = "AED") {
  const n = Number(v);
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
