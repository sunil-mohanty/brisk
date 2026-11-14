"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CampaignForm } from "@/components/CampaignForm";
import { AddonGate, useCampaignsOn } from "@/components/QuoteCampaign";
import { Loading, PageHead } from "@/components/ui";

export default function NewCampaignPage() {
  return <Suspense fallback={<Loading />}><NewCampaign /></Suspense>;
}

function NewCampaign() {
  const on = useCampaignsOn();
  const template = useSearchParams().get("template");
  return (
    <>
      <PageHead title="New campaign" eyebrow="Campaign · social & groups"
        sub="Two steps: create the offer (or start from a ready-made one), then choose where it goes: Facebook, Instagram or WhatsApp to a client group. Anyone who sees it can accept and book." />
      {on ? <CampaignForm template={template} /> : <AddonGate />}
    </>
  );
}
