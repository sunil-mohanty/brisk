import type { Metadata } from "next";
import { Suspense } from "react";
import { aed, fetchQuote } from "@/lib/server";
import { PublicQuote } from "./QuoteView";

type Props = { params: Promise<{ token: string }> };

// What WhatsApp shows when the link is sent: the business, the quote number and the total.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const q = await fetchQuote(token);
  if (!q) return { title: "Quotation", robots: { index: false } };
  const title = `Quotation ${q.label} from ${q.business.name}`;
  const description = `${aed(q.totals.total, q.currency)} for ${q.customer_name}. Tap to view the details and accept.`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", siteName: q.business.name },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function Page() {
  return <Suspense fallback={null}><PublicQuote /></Suspense>;
}
