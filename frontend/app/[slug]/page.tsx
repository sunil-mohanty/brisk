import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { LinkPageView } from "@/components/LinkPageView";
import { fetchLinkPage } from "@/lib/server";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

// What Instagram, TikTok and WhatsApp show when the link is shared.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = SLUG.test(slug.toLowerCase()) ? await fetchLinkPage(slug) : null;
  if (!p) return { title: "Page not found", robots: { index: false } };
  const title = p.business.name;
  const description = p.bio || p.business.tagline || `Book an appointment at ${p.business.name}.`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "website", siteName: p.business.name },
    twitter: { card: "summary_large_image", title, description },
  };
}

export const viewport: Viewport = { themeColor: "#f3eadf" };

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview } = await searchParams;
  if (!SLUG.test(slug.toLowerCase())) notFound();
  const initial = await fetchLinkPage(slug);
  if (!initial) notFound();
  return <LinkPageView slug={slug.toLowerCase()} initial={initial} preview={preview === "1"} />;
}
