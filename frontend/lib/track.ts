// Remembers which ad or site brought a visitor, so the admin can see where each SME came from,
// and tells Google Ads / Meta when someone signs up (if their IDs are set in lib/site.ts).
import { site } from "./site";

const KEY = "salon_came_from";

type Attribution = { source: string | null; campaign: string | null; at: number };

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

/** Call on any public page. Keeps the first source seen in the last 30 days. */
export function rememberSource() {
  try {
    const p = new URLSearchParams(window.location.search);
    const existing = read();
    const fresh = existing && Date.now() - existing.at < 30 * 864e5;
    let source = p.get("utm_source") || (p.get("gclid") ? "google" : null) || (p.get("fbclid") ? "facebook" : null);
    const campaign = p.get("utm_campaign");
    if (!source && document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, "");
      if (host && !host.endsWith(window.location.hostname.replace(/^app\./, ""))) source = host;
    }
    if (source && !(fresh && existing?.source)) {
      localStorage.setItem(KEY, JSON.stringify({ source: source.slice(0, 120), campaign: campaign?.slice(0, 160) ?? null, at: Date.now() }));
    }
  } catch {
    /* storage blocked: fine */
  }
}

function read(): Attribution | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

export function cameFrom(): { source: string | null; campaign: string | null } {
  const a = read();
  return { source: a?.source ?? null, campaign: a?.campaign ?? null };
}

/** Fire the "sign-up completed" conversion for ads. */
export function trackSignup() {
  try {
    if (window.gtag) {
      if (site.googleAdsId && site.googleAdsSignupLabel) window.gtag("event", "conversion", { send_to: `${site.googleAdsId}/${site.googleAdsSignupLabel}` });
      window.gtag("event", "sign_up", { method: "email" });
    }
    window.fbq?.("track", "CompleteRegistration");
  } catch {
    /* never block sign-up on tracking */
  }
}

export function trackLead(where: string) {
  try {
    window.gtag?.("event", "generate_lead", { where });
    window.fbq?.("track", "Lead");
  } catch {
    /* ignore */
  }
}
