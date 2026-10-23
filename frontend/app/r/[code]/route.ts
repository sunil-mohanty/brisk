import { NextResponse, type NextRequest } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:8000";

/** Target of every printed QR code: count the scan, then send the person on. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const headers: Record<string, string> = {};
  const ua = req.headers.get("user-agent");
  const xff = req.headers.get("x-forwarded-for");
  if (ua) headers["user-agent"] = ua;
  if (xff) headers["x-forwarded-for"] = xff;

  const res = await fetch(`${API_URL}/api/public/r/${encodeURIComponent(code)}`, { headers, cache: "no-store" });
  if (!res.ok) return NextResponse.redirect(new URL(`/l/${encodeURIComponent(code)}`, req.url));
  const { url } = (await res.json()) as { url: string };
  return NextResponse.redirect(url, 302);
}
