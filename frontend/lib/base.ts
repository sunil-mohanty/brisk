import { headers } from "next/headers";

/**
 * The public address of this site, taken from the request itself (Railway passes the visitor's host).
 * Link previews (WhatsApp, Facebook) need absolute picture URLs, and this keeps them right on any domain,
 * even when NEXT_PUBLIC_SITE_URL isn't set.
 */
export async function siteBase(): Promise<URL> {
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
    if (host && !/^(localhost|127\.|0\.0\.0\.0)/.test(host)) {
      // Public sites are always served over https (WhatsApp won't load preview pictures over http).
      return new URL(`https://${host}`);
    }
  } catch { /* outside a request (build time) */ }
  return new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
}
