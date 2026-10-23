import type { Metadata } from "next";
import { fetchAppointment } from "@/lib/server";
import { AppointmentView } from "./AppointmentView";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const a = await fetchAppointment(token);
  if (!a) return { title: "Your appointment", robots: { index: false } };
  const when = new Date(a.starts_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const title = `Your appointment at ${a.business.name}`;
  const description = `${a.service}, ${when}${a.stylist ? ` with ${a.stylist}` : ""}. Tap to add it to your calendar.`;
  return { title: { absolute: title }, description, robots: { index: false, follow: false }, openGraph: { title, description, type: "website", siteName: a.business.name } };
}

export default async function Page({ params }: Props) {
  const { token } = await params;
  return <AppointmentView token={token} initial={await fetchAppointment(token)} />;
}
