import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/ogcard";
import { ogFonts } from "@/lib/ogfonts";
import { aed, fetchQuote } from "@/lib/server";

export const runtime = "nodejs";
const size = { width: 1200, height: 630 };

// Link-preview card for a quote without its own picture: the business, the quote number and the total.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await fetchQuote(token);
  const decided = q?.status === "accepted" ? "Accepted" : q?.status === "rejected" ? "Declined" : q?.expired ? "Expired" : null;
  return new ImageResponse(
    <OgCard vertical={q?.business.vertical} initials={q?.business.initials ?? "S"} name={q?.business.name ?? "Business"} kicker={q ? `Quotation ${q.label}` : "Quotation"}
      big={q ? aed(q.totals.total, q.currency) : ""} sub={q ? `for ${q.customer_name}` : undefined} cta={decided ?? "Tap to view & accept"} done={decided === "Accepted"} />,
    { ...size, fonts: await ogFonts(), headers: { "Cache-Control": "public, max-age=300" } },
  );
}
