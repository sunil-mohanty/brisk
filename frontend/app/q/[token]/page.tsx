import type { Metadata } from "next";
import { Suspense } from "react";
import { aed, fetchQuote } from "@/lib/server";
import { siteBase } from "@/lib/base";
import { PublicQuote } from "./QuoteView";

type Props = { params: Promise<{ token: string }> };

// What WhatsApp shows when the link is sent: the business, the quote number and the total.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const q = await fetchQuote(token);
  if (!q) return { title: "Quotation", robots: { index: false } };
  const title = `Quotation ${q.label} from ${q.business.name}`;
  const description = `${aed(q.totals.total, q.currency)} for ${q.customer_name}. Tap to view the details and accept.`;
  // The quote's own picture (small square JPEG) when it has one, else a card with the total. Absolute URLs for WhatsApp.
  const base = await siteBase();
  const t = encodeURIComponent(token);
  const v = encodeURIComponent(q.picture_url?.split("v=")[1] ?? q.status);
  const image = q.picture_url
    ? { url: new URL(`/api/public/q/${t}/share.jpg?v=${v}`, base).toString(), type: "image/jpeg", width: 800, height: 800, alt: title }
    : { url: new URL(`/q/${t}/card.png?v=${v}`, base).toString(), type: "image/png", width: 1200, height: 630, alt: title };
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", url: new URL(`/q/${t}`, base).toString(), siteName: q.business.name, images: [{ ...image, secureUrl: image.url }] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function Page() {
  return <Suspense fallback={null}><PublicQuote /></Suspense>;
}
