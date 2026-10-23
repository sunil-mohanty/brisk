import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/ogcard";
import { ogFonts } from "@/lib/ogfonts";
import { aed, fetchQuote } from "@/lib/server";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Quotation";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await fetchQuote(token);
  const decided = q?.status === "accepted" ? "Accepted" : q?.status === "rejected" ? "Declined" : q?.expired ? "Expired" : null;
  return new ImageResponse(
    <OgCard initials={q?.business.initials ?? "S"} name={q?.business.name ?? "Salon"} kicker={q ? `Quotation ${q.label}` : "Quotation"}
      big={q ? aed(q.totals.total, q.currency) : ""} sub={q ? `for ${q.customer_name}` : undefined} cta={decided ?? "Tap to view & accept"} done={decided === "Accepted"} />,
    { ...size, fonts: await ogFonts(), headers: { "Cache-Control": "public, max-age=300" } },
  );
}
