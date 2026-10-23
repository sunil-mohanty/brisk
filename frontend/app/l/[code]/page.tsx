"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Powered, PubHeader, PubShell } from "@/components/PubHeader";
import { api } from "@/lib/api";
import { addDays, fmtDay, todayUAE } from "@/lib/format";
import type { PublicLanding } from "@/lib/types";
import { TIME_SLOTS } from "@/lib/vocab";

/** Where a printed QR code (counter, mirror, flyer) sends people who don't go straight to WhatsApp. */
export default function LandingPage() {
  const { code } = useParams<{ code: string }>();
  const [p, setP] = useState<PublicLanding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", phone: "", requirement: "", date: "", time: "" });
  const [picked, setPicked] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get<PublicLanding>(`/public/l/${code}`).then(setP).catch((e) => setError(e.message)); }, [code]);

  async function go(kind: "whatsapp" | "call") {
    try {
      const { url } = await api.post<{ url: string }>(`/public/l/${code}/click`, { kind });
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/public/l/${code}/enquiry`, {
        name: f.name, phone: f.phone, requirement: f.requirement || null, service_interest: picked.join(", ") || null,
        preferred_date: f.date || null, preferred_time: f.time || null,
      });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  if (error && !p) return <PubShell><div className="banner bad">{error}</div></PubShell>;
  if (!p) return <PubShell><small>Loading…</small></PubShell>;

  return (
    <PubShell>
      <PubHeader business={p.business} />
      <div className="pbtns">
        {p.business.whatsapp_url && <button className="btn wa" onClick={() => go("whatsapp")}>Message us on WhatsApp</button>}
        {p.business.phone && <button className="btn" onClick={() => go("call")}>Call {p.business.phone}</button>}
      </div>
      <div className="pcard">
        {sent ? (
          <div className="banner ok">Thanks, {f.name.split(" ")[0]}. {p.business.name} will message you to confirm a time.</div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 24 }}>Request an appointment</h3>
            {error && <div className="banner bad">{error}</div>}
            {p.menu.length > 0 && (
              <div className="chips-inline">
                {p.menu.slice(0, 12).map((m) => (
                  <button type="button" key={m.name} className="chip" aria-pressed={picked.includes(m.name)} onClick={() => setPicked(picked.includes(m.name) ? picked.filter((x) => x !== m.name) : [...picked, m.name])}>{m.name}</button>
                ))}
              </div>
            )}
            <label>Preferred day
              <select value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}>
                <option value="">Any day</option>
                {Array.from({ length: 14 }, (_, i) => addDays(todayUAE(), i)).map((d, i) => <option key={d} value={d}>{i === 0 ? "Today" : i === 1 ? "Tomorrow" : fmtDay(d)}</option>)}
              </select>
            </label>
            <div className="chips-inline">
              {TIME_SLOTS.map((t) => <button type="button" key={t} className="chip" aria-pressed={f.time === t} onClick={() => setF({ ...f, time: f.time === t ? "" : t })}>{t}</button>)}
            </div>
            <label>Your name<input id="e-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
            <label>Mobile<input id="e-phone" required minLength={6} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="050 123 4567" /></label>
            <label>Anything else? <span className="hint">(optional)</span><textarea id="e-req" value={f.requirement} onChange={(e) => setF({ ...f, requirement: e.target.value })} /></label>
            <button className="btn primary" style={{ padding: 14 }} disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
          </form>
        )}
      </div>
      {p.business.address && <small>{p.business.address}</small>}
      <Powered />
    </PubShell>
  );
}
