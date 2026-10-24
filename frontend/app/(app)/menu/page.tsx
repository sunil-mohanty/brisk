"use client";

import { ServiceMenu } from "@/components/ServiceMenu";
import { useWords } from "@/components/session";
import { PageHead } from "@/components/ui";

export default function ServicesPage() {
  const W = useWords();
  return (
    <>
      {W.vertical === "real_estate"
        ? <PageHead title="Listings" eyebrow="Properties & services" sub="Properties you show and services you charge for, with prices and viewing times. Used when booking viewings, on quotes and campaigns, and to work out free viewing slots." />
        : <PageHead title="Services" eyebrow="Menu & prices" sub="Your service menu with prices and times. Used when booking, on quotes and campaigns, and to work out free slots for clients." />}
      <ServiceMenu />
    </>
  );
}
