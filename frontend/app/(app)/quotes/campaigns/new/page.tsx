"use client";

import { CampaignForm } from "@/components/CampaignForm";
import { AddonGate, useCampaignsOn } from "@/components/QuoteCampaign";
import { PageHead } from "@/components/ui";

export default function NewCampaignPage() {
  const on = useCampaignsOn();
  return (
    <>
      <PageHead title="New campaign" eyebrow="Campaign · social & groups"
        sub="Two steps: create the offer, then choose where it goes: Facebook, Instagram or WhatsApp to a client group. Anyone who sees it can accept and book." />
      {on ? <CampaignForm /> : <AddonGate />}
    </>
  );
}
