import type { Metadata } from "next";
import { Suspense } from "react";
import { aed, fetchCampaign } from "@/lib/server";
import { siteBase } from "@/lib/base";
import { CampaignView } from "./CampaignView";

type Props = { params: Promise<{ token: string }> };

// What Instagram, Facebook and WhatsApp show when the offer link is shared.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const c = await fetchCampaign(token);
  if (!c) return { title: "Offer", robots: { index: false } };
  const title = `${c.title} · ${c.business.name}`;
  // A small JPEG made for link previews (WhatsApp skips pictures over ~300 KB), with an absolute URL.
  const base = await siteBase();
  const img = new URL(`/api/public/c/${encodeURIComponent(token)}/share.jpg?v=${encodeURIComponent(c.image_version ?? "")}`, base).toString();
  const description = `${aed(c.totals.total, c.currency)}. ${c.description ?? ""} Accept and book your time online.`.trim();
  return { title: { absolute: title }, description, openGraph: { title, description, type: "website", url: new URL(`/c/${token}`, base).toString(), siteName: c.business.name, images: [{ url: img, secureUrl: img, type: "image/jpeg", width: 800, height: 800, alt: title }] }, twitter: { card: "summary_large_image", title, description, images: [img] } };
}

export default function Page() {
  return <Suspense fallback={null}><CampaignView /></Suspense>;
}
