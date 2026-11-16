"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { WhatsAppSend, WhatsAppStatus } from "./types";

let cached: WhatsAppStatus | null = null;
let pending: Promise<WhatsAppStatus> | null = null;

/** Whether the WhatsApp Business API is connected (quotes go out with Accept buttons). */
export function useWhatsApp(): WhatsAppStatus | null {
  const [st, setSt] = useState<WhatsAppStatus | null>(cached);
  useEffect(() => {
    if (cached) return;
    pending ??= api.get<WhatsAppStatus>("/whatsapp/status").then((r) => (cached = r)).finally(() => { pending = null; });
    pending.then(setSt).catch(() => setSt({ automatic: false, quotes: false, webhook: false, business_number: null }));
  }, []);
  return st;
}

export const sendQuoteWhatsApp = (id: number) => api.post<WhatsAppSend>(`/quotes/${id}/whatsapp`);

export const WA_LABEL: Record<string, string> = {
  sent: "Sent on WhatsApp",
  delivered: "Delivered on WhatsApp",
  read: "Read on WhatsApp",
  failed: "WhatsApp failed",
};

/** Meta's reason a WhatsApp message didn't arrive, in plain words (error is "131049: …" as stored by Brisk). */
export function waWhy(error: string | null | undefined): string | null {
  if (!error) return null;
  const code = (error.match(/^(\d+)/) || [])[1];
  const why: Record<string, string> = {
    "131042": "Meta needs a payment method (or the card was declined). Add or fix it in WhatsApp Manager → Billing.",
    "131049": "Meta held this marketing message back: this person got many offers lately (from any business). Try again in a day or two.",
    "131050": "This client turned off marketing messages from you in WhatsApp.",
    "131026": "This number can't receive it: not on WhatsApp, an old WhatsApp version, or they haven't accepted WhatsApp's latest terms.",
    "131030": "This number isn't on the test number's recipient list. Add it in Meta (API Setup → To), or send from your own number.",
    "131053": "WhatsApp couldn't download the campaign picture. Check the web address in APP_URL is public (https).",
    "132000": "The template's variables don't match what Brisk sends. Check the template body has {{1}} to {{6}}.",
    "132012": "The template's variables don't match what Brisk sends. Check the template body has {{1}} to {{6}}.",
    "132001": "The template wasn't found for this number. It must be in the same WhatsApp account, in English, and Active.",
    "131047": "More than 24 hours since this client last wrote, so only a template can be sent.",
    "130472": "Meta held this marketing message back as part of a WhatsApp experiment on this person's number.",
    "131031": "The WhatsApp account is restricted. Check WhatsApp Manager for a warning.",
    "131056": "Too many messages to this number in a short time. Try again in a minute.",
    "190": "The access token isn't valid. Make a new permanent token and update WHATSAPP_TOKEN.",
  };
  return (code && why[code]) || `WhatsApp said: ${error}`;
}
