"use client";

import { useState } from "react";
import { useSession } from "@/components/session";
import { ErrorBox, PageHead, toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Business } from "@/lib/types";
import { BUSINESS_TYPES, VOCAB } from "@/lib/vocab";
import { Tip } from "@/components/Tips";
import { site } from "@/lib/site";

export default function SettingsPage() {
  const { business, setBusiness } = useSession();
  const [f, setF] = useState({
    name: business.name, phone: business.phone ?? "", whatsapp: business.whatsapp ?? "", email: business.email ?? "",
    tagline: business.tagline ?? "", address: business.address ?? "", trn: business.trn ?? "", default_vat_rate: business.default_vat_rate, business_type: business.business_type ?? "unisex",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "" ? null : v]));
      body.name = f.name;
      setBusiness(await api.patch<Business>("/business", body));
      toast("Salon profile saved");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <PageHead eyebrow="Settings" title="Salon profile" sub="Clients see this on booking confirmations, quotes, their visit history and your link page." />
      <form className="card" onSubmit={save}>
        <ErrorBox error={error} />
        <div className="form" style={{ marginTop: error ? 12 : 0 }}>
          <label className="full">Salon name<input id="b-name" required value={f.name} onChange={set("name")} /></label>
          <label className="full">
            Kind of salon
            <Tip id="set.type" order={1} text={`Sets the suggested services and words like Stylist or Barber across ${site.name}.`}>
            <select id="b-type" value={f.business_type} onChange={set("business_type")}>
              {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{VOCAB[t].label}</option>)}
            </select>
            </Tip>
            <span className="hint">{VOCAB[f.business_type as keyof typeof VOCAB]?.examples}</span>
          </label>
          <label className="full">Tagline<input id="b-tagline" value={f.tagline} onChange={set("tagline")} placeholder="What you do and where, e.g. Hair, nails & bridal · Al Barsha" /></label>
          <label>Phone<input id="b-phone" value={f.phone} onChange={set("phone")} inputMode="tel" /></label>
          <label>WhatsApp number<Tip id="set.wa" order={2} text="Every WhatsApp button your clients see opens a chat with this number."><input id="b-wa" value={f.whatsapp} onChange={set("whatsapp")} inputMode="tel" placeholder="Used for every WhatsApp button clients see" /></Tip></label>
          <label>Email<input id="b-email" type="email" value={f.email} onChange={set("email")} /></label>
          <label>TRN (VAT registration)<input id="b-trn" value={f.trn} onChange={set("trn")} placeholder="15 digits, printed on quotes" /></label>
          <label className="full">Address<input id="b-address" value={f.address} onChange={set("address")} /></label>
          <label>Default VAT %<input id="b-vat" type="number" min="0" max="100" step="0.5" value={f.default_vat_rate} onChange={set("default_vat_rate")} /></label>
        </div>
        <div className="foot"><button className="btn primary">Save</button></div>
      </form>
      <Hours />
    </>
  );
}


const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Opening hours: clients who accept a quote or campaign can only pick free times inside these. */
function Hours() {
  const { business, setBusiness } = useSession();
  const [open, setOpen] = useState(business.open_time);
  const [close, setClose] = useState(business.close_time);
  const [closed, setClosed] = useState<number[]>(business.closed_days ? business.closed_days.split(",").map(Number) : []);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setBusiness(await api.patch<Business>("/business", { open_time: open, close_time: close, closed_days: [...closed].sort().join(",") }));
      toast("Opening hours saved");
    } catch (err) { setError((err as Error).message); }
  }
  return (
    <form className="panel" onSubmit={save} style={{ marginTop: 16 }} id="hours">
      <h2>Opening hours <span className="muted small">clients can only book free times inside these</span></h2>
      <ErrorBox error={error} />
      <div className="form" style={{ gridTemplateColumns: "160px 160px 1fr", alignItems: "end" }}>
        <label>Opens<input type="time" value={open} onChange={(e) => setOpen(e.target.value)} /></label>
        <label>Closes<input type="time" value={close} onChange={(e) => setClose(e.target.value)} /></label>
        <div>
          <label>Days open</label>
          <div className="chips-inline" style={{ marginTop: 5 }}>
            {DAYS.map((d, i) => (
              <button type="button" key={d} className="chip" aria-pressed={!closed.includes(i)} onClick={() => setClosed(closed.includes(i) ? closed.filter((x) => x !== i) : [...closed, i])}>{d}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="foot"><button className="btn primary">Save hours</button></div>
    </form>
  );
}
