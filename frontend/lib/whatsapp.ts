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
