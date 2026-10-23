import type { Metadata } from "next";
import { fetchService } from "@/lib/server";
import { ServiceCard } from "./ServiceView";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const s = await fetchService(token);
  if (!s) return { title: "Your visits", robots: { index: false } };
  const title = `Your visits at ${s.business.name}`;
  const description = `${s.service} for ${s.customer_name}. Keep this link: it has your history${s.next_service_date ? " and your next date" : ""}.`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", siteName: s.business.name },
  };
}

export default function Page() {
  return <ServiceCard />;
}
