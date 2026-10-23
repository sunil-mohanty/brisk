"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Powered, PubHeader, PubShell } from "@/components/PubHeader";
import { api } from "@/lib/api";
import { daysUntil, fmtDate, money } from "@/lib/format";
import type { PublicService } from "@/lib/types";
import { vocab } from "@/lib/vocab";

export function ServiceCard() {
  const { token } = useParams<{ token: string }>();
  const [s, setS] = useState<PublicService | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.get<PublicService>(`/public/s/${token}`).then(setS).catch((e) => setError(e.message)); }, [token]);

  if (error) return <PubShell><div className="banner bad">{error}</div></PubShell>;
  if (!s) return <PubShell><small>Loading…</small></PubShell>;
  const d = s.next_service_date ? daysUntil(s.next_service_date) : null;
  const v = vocab(s.business.business_type);
  const wa = s.business.whatsapp_url
    ? `${s.business.whatsapp_url}?text=${encodeURIComponent(`Hi, I'd like to book my next ${s.service}. Name: ${s.customer_name}`)}`
    : null;

  return (
    <PubShell>
      <PubHeader business={s.business} />
      <div className="pcard">
        <div className="kicker">Your visit</div>
        <h3>{s.service}</h3>
        <div className="pmeta">
          <div>Client<b>{s.customer_name}</b></div>
          <div>Date<b>{fmtDate(s.service_date)}</b></div>
          {s.technician && <div>{v.staff}<b>{s.technician}</b></div>}
          <div>Amount<b>{money(s.amount, s.currency)}</b></div>
          {s.reference && <div className="wide">Details<b>{s.reference}</b></div>}
        </div>
        {s.notes && <p style={{ fontSize: 13, margin: "12px 0 0", color: "var(--pub-muted)", whiteSpace: "pre-wrap" }}>{s.notes}</p>}
      </div>
      {s.next_service_date && (
        <div className="next">
          <div><span>Your next visit, around</span><br /><b>{fmtDate(s.next_service_date)}</b></div>
          <span>{d! < 0 ? "Due now" : `in ${d} days`}</span>
        </div>
      )}
      <div className="pcard">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Your visits</div>
        <div className="hist">
          {s.history.map((h, i) => (
            <div key={i}>
              <span className="mono" style={{ color: "var(--pub-muted)", fontSize: 12 }}>{fmtDate(h.service_date)}</span>
              <span>{h.service}</span>
              <span className="mono">{money(h.amount, s.currency)}</span>
            </div>
          ))}
        </div>
      </div>
      {wa && <div className="pbtns"><a className="btn wa" href={wa} target="_blank" rel="noreferrer">Book your next visit on WhatsApp</a></div>}
      <small>Bookmark this page. It keeps your full history with {s.business.name}.</small>
      <Powered />
    </PubShell>
  );
}
