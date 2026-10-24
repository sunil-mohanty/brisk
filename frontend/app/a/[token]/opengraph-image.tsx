import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/ogcard";
import { ogFonts } from "@/lib/ogfonts";
import { fetchAppointment } from "@/lib/server";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Your appointment";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await fetchAppointment(token);
  const day = a ? new Date(a.starts_at).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short" }) : "";
  const time = a ? new Date(a.starts_at).toLocaleTimeString("en-US", { timeZone: "Asia/Dubai", hour: "numeric", minute: "2-digit" }).toLowerCase() : "";
  return new ImageResponse(
    <OgCard vertical={a?.business.vertical} initials={a?.business.initials ?? "S"} name={a?.business.name ?? "Business"} kicker={a?.service ?? (a?.business.vertical === "real_estate" ? "Your viewing" : "Your appointment")} big={a ? `${day}, ${time}` : ""}
      sub={a?.stylist ? `with ${a.stylist}` : undefined} cta={a?.status === "cancelled" ? "Cancelled" : "Tap to add to your calendar"} />,
    { ...size, fonts: await ogFonts() },
  );
}
