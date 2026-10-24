"use client";

import { useEffect, useState } from "react";
import { Powered, PubHeader, PubShell } from "@/components/PubHeader";
import { api } from "@/lib/api";
import { fmtDayLong, fmtTime, money, uaeDate } from "@/lib/format";
import type { PublicAppointment } from "@/lib/types";
import { duration } from "@/lib/vocab";
import { words } from "@/lib/words";

/** The client's confirmation page: when, where, with whom, add to calendar, change on WhatsApp. */
export function AppointmentView({ token, initial }: { token: string; initial: PublicAppointment | null }) {
  const [a, setA] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.get<PublicAppointment>(`/public/a/${token}`).then(setA).catch((e) => !initial && setError(e.message)); }, [token, initial]);

  if (error) return <PubShell><div className="banner bad">{error}</div></PubShell>;
  if (!a) return <PubShell><small>Loading…</small></PubShell>;
  const gone = a.status === "cancelled" || a.status === "no_show";
  const past = new Date(a.ends_at) < new Date();
  const maps = a.address ? `https://maps.google.com/?q=${encodeURIComponent(a.address)}` : null;

  return (
    <PubShell vertical={a.business.vertical}>
      <PubHeader business={a.business} />
      {gone && <div className="banner bad">This {words(a.business.business_type).appointment} was cancelled. Message {a.business.name} to book a new time.</div>}
      {a.status === "completed" && <div className="banner ok">Thanks for visiting, {a.customer_name.split(" ")[0]}.</div>}
      <div className="pcard">
        <div className="kicker">{a.status === "confirmed" ? "Confirmed" : `Your ${words(a.business.business_type).appointment}`}</div>
        <h3 style={gone ? { textDecoration: "line-through" } : undefined}>{fmtDayLong(uaeDate(a.starts_at))}</h3>
        <p style={{ margin: "0 0 14px", fontSize: 18 }}>{fmtTime(a.starts_at)} – {fmtTime(a.ends_at)}</p>
        <div className="pmeta">
          <div className="wide">Service<b>{a.service}</b></div>
          {a.stylist && <div>With<b>{a.stylist}</b></div>}
          <div>Time<b>{duration(a.duration_min)}</b></div>
          {Number(a.price) > 0 && <div>Price<b>{money(a.price, a.currency)}</b></div>}
          <div className="wide">{a.location === "home" ? (a.business.vertical === "real_estate" ? "Property" : "Home visit at") : "Where"}<b>{a.address ?? a.business.name}</b></div>
        </div>
      </div>
      {!gone && !past && (
        <div className="pbtns">
          <a className="btn primary" href={`/api/public/a/${token}/ics`}>Add to my calendar</a>
          <div className="row2">
            {maps && a.location !== "home" && <a className="btn" href={maps} target="_blank" rel="noreferrer">Directions</a>}
            {a.reschedule_url && <a className="btn" href={a.reschedule_url} target="_blank" rel="noreferrer" style={maps && a.location !== "home" ? undefined : { gridColumn: "1 / -1" }}>Need to change it?</a>}
          </div>
        </div>
      )}
      {(gone || past) && a.business.whatsapp_url && <div className="pbtns"><a className="btn wa" href={a.business.whatsapp_url} target="_blank" rel="noreferrer">Book again on WhatsApp</a></div>}
      <Powered />
    </PubShell>
  );
}
