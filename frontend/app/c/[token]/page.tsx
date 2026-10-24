import type { Metadata } from "next";
import { Suspense } from "react";
import { aed, fetchCampaign } from "@/lib/server";
import { CampaignView } from "./CampaignView";

type Props = { params: Promise<{ token: string }> };

// What Instagram, Facebook and WhatsApp show when the offer link is shared.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const c = await fetchCampaign(token);
  if (!c) return { title: "Offer", robots: { index: false } };
  const title = `${c.title} · ${c.business.name}`;
  const img = `/api/public/c/${encodeURIComponent(token)}/image/square.jpg`;
  const description = `${aed(c.totals.total, c.currency)}. ${c.description ?? ""} Accept and book your time online.`.trim();
  return { title: { absolute: title }, description, openGraph: { title, description, type: "website", siteName: c.business.name, images: [{ url: img, width: 1080, height: 1080, alt: title }] }, twitter: { card: "summary_large_image", title, description, images: [img] } };
}

export default function Page() {
  return <Suspense fallback={null}><CampaignView /></Suspense>;
}
