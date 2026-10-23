import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/ogcard";
import { ogFonts } from "@/lib/ogfonts";
import { fetchService } from "@/lib/server";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Your visits";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await fetchService(token);
  const next = s?.next_service_date ? new Date(s.next_service_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
  return new ImageResponse(
    <OgCard initials={s?.business.initials ?? "S"} name={s?.business.name ?? "Salon"} kicker="Your visit" big={s?.service ?? ""}
      cta={next ? `Next visit around ${next}` : "Tap to see your visits"} />,
    { ...size, fonts: await ogFonts() },
  );
}
