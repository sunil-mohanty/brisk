"use client";

import { ServiceMenu } from "@/components/ServiceMenu";
import { PageHead } from "@/components/ui";

export default function ServicesPage() {
  return (
    <>
      <PageHead title="Services" eyebrow="Menu & prices" sub="Your service menu with prices and times. Used when booking, on quotes and campaigns, and to work out free slots for clients." />
      <ServiceMenu />
    </>
  );
}
