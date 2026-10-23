import { NextResponse, type NextRequest } from "next/server";

// When NEXT_PUBLIC_SITE_URL is set (e.g. https://yourdomain.com), anyone opening an older address
// such as app.yourdomain.com or www. is sent to the same page on the main address. Printed QR codes and
// quote links that were shared earlier keep working.
const SITE = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : null;
const OLD_HOSTS = SITE ? [`app.${SITE.hostname.replace(/^www\./, "")}`, `www.${SITE.hostname}`].filter((h) => h !== SITE.hostname) : [];

export function middleware(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (SITE && OLD_HOSTS.includes(host)) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, SITE);
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
