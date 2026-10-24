"use client";

import { CampaignForm } from "@/components/CampaignForm";
import { PageHead } from "@/components/ui";

export default function NewCampaignPage() {
  return (
    <>
      <PageHead title="New campaign" eyebrow="Social media & ads" sub="One offer, one link and QR code. Anyone who sees your post or ad can accept it and book a free time." />
      <CampaignForm />
    </>
  );
}
