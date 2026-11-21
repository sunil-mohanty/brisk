"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/components/session";
import { ErrorBox, PageHead, Pill, toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Business, SocialAccount, SocialStatus } from "@/lib/types";
import { PLATFORMS } from "@/lib/social";
import { BUSINESS_TYPES, VOCAB } from "@/lib/vocab";
import { Tip } from "@/components/Tips";
import { site } from "@/lib/site";
import { useWhatsApp } from "@/lib/whatsapp";
import { words } from "@/lib/words";

export default function SettingsPage() {
  const { business, setBusiness } = useSession();
  const [f, setF] = useState({
    name: business.name, phone: business.phone ?? "", whatsapp: business.whatsapp ?? "", email: business.email ?? "",
    tagline: business.tagline ?? "", address: business.address ?? "", trn: business.trn ?? "", default_vat_rate: business.default_vat_rate, business_type: business.business_type ?? "unisex",
  });
  const [error, setError] = useState<string | null>(null);
  const W = words(business.business_type);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "" ? null : v]));
      body.name = f.name;
      setBusiness(await api.patch<Business>("/business", body));
      toast(`${W.Business} profile saved`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <PageHead eyebrow="Settings" title={`${W.Business} profile`} sub={`Clients see this on ${W.appointment} confirmations, quotes, their history and your link page.`} />
      <LogoPanel />
      <form className="card" onSubmit={save}>
        <ErrorBox error={error} />
        <div className="form" style={{ marginTop: error ? 12 : 0 }}>
          <label className="full">{W.Business} name<input id="b-name" required value={f.name} onChange={set("name")} /></label>
          {W.vertical === "salon" && <label className="full">
            Kind of salon
            <Tip id="set.type" order={1} text={`Sets the suggested services and words like Stylist or Barber across ${site.name}.`}>
            <select id="b-type" value={f.business_type} onChange={set("business_type")}>
              {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{VOCAB[t].label}</option>)}
            </select>
            </Tip>
            <span className="hint">{VOCAB[f.business_type as keyof typeof VOCAB]?.examples}</span>
          </label>}
          <label className="full">Tagline<input id="b-tagline" value={f.tagline} onChange={set("tagline")} placeholder={W.vertical === "real_estate" ? "What you do and where, e.g. Sales & leasing · Dubai Marina" : "What you do and where, e.g. Hair, nails & bridal · Al Barsha"} /></label>
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
      <Suspense fallback={null}><SocialPanel /></Suspense>
      <WhatsAppPanel />
    </>
  );
}


/** The salon's logo: shown at the top of the menu (and wherever the salon's brand appears). */
function LogoPanel() {
  const { business, setBusiness } = useSession();
  const [busy, setBusy] = useState(false);
  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try { setBusiness(await api.upload<Business>("/business/logo", f, "PUT")); toast("Logo saved"); }
    catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  async function remove() {
    setBusiness(await api.del<Business>("/business/logo"));
    toast("Logo removed");
  }
  return (
    <section className="panel logo-panel" style={{ marginBottom: 16 }}>
      <div className="logo-prev">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {business.logo_url ? <img src={business.logo_url} alt={`${business.name} logo`} /> : <span>{(business.name.trim()[0] || "S").toUpperCase()}</span>}
      </div>
      <div className="logo-t">
        <h2 style={{ margin: 0 }}>Logo</h2>
        <p className="small muted" style={{ margin: "4px 0 10px" }}>Shown at the top of the menu, next to your name. A square PNG or JPG works best (at least 256 × 256).</p>
        <div className="acts" style={{ justifyContent: "flex-start" }}>
          <label className="btn sm primary" style={{ cursor: "pointer" }}>
            {busy ? "Uploading…" : business.logo_url ? "Change logo" : "Upload logo"}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {business.logo_url && <button type="button" className="btn sm ghost" onClick={remove}>Remove</button>}
        </div>
      </div>
    </section>
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


/** Whether the WhatsApp Business API is connected (set up once by the platform owner on the server). */
function WhatsAppPanel() {
  const wa = useWhatsApp();
  const { business, setBusiness } = useSession();
  const [auto, setAuto] = useState(business.wa_auto_reply ?? "");
  const [saving, setSaving] = useState(false);
  if (!wa || !wa.automatic) return null;  // phase 1: messages go from the owner's own WhatsApp
  const fallback = `Thanks for contacting ${business.name}, we will reach out to you shortly.`;
  async function saveAuto() {
    setSaving(true);
    try { setBusiness(await api.patch<Business>("/business", { wa_auto_reply: auto.trim() || null })); toast("Automatic reply saved"); }
    catch (e) { toast((e as Error).message); }
    setSaving(false);
  }
  const rows: [boolean, string, string][] = [
    [wa.automatic, "Booking confirmations", "sent the moment a client books"],
    [wa.quotes, "Quotes with Accept / Decline buttons", "clients accept and pick a time inside WhatsApp"],
    [wa.webhook, "Replies from clients", "button taps and messages are handled by themselves"],
  ];
  return (
    <section className="panel" style={{ marginTop: 16 }} id="whatsapp">
      <h2>WhatsApp <span className="muted small">{wa.automatic ? `automatic, from ${wa.business_number ?? "the business number"}` : "sent from your own phone"}</span></h2>
      <div className="list">
        {rows.map(([on, t, d]) => (
          <div className="row" key={t}>
            <div className="l"><b>{t}</b><div>{d}</div></div>
            <Pill status={on ? "accepted" : "neutral"} label={on ? "On" : "Off"} />
          </div>
        ))}
      </div>
      <label className="full" style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="lbl">Automatic reply <span className="hint-inline">(when a client writes to your WhatsApp; once a day per client)</span></span>
        <textarea rows={2} maxLength={1000} value={auto} onChange={(e) => setAuto(e.target.value)} placeholder={fallback} />
        <span className="hint">Leave empty to use: “{fallback}” Their message lands in Leads &amp; Enquiries, where you can reply.</span>
      </label>
      <div className="foot" style={{ marginTop: 10 }}><button type="button" className="btn primary" disabled={saving} onClick={saveAuto}>{saving ? "Saving…" : "Save reply"}</button></div>
      {!wa.automatic && <p className="note" style={{ marginBottom: 0 }}>Without the WhatsApp Business API, {site.name} opens WhatsApp on your phone with each message ready, and you press send.</p>}
    </section>
  );
}


/** Facebook Page, Instagram and YouTube channel that campaigns are posted to. */
function SocialPanel() {
  const params = useSearchParams();
  const [st, setSt] = useState<SocialStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.get<SocialStatus>("/social").then(setSt).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    const r = params.get("social");
    if (r === "connected") toast("Connected. You can post campaigns from Quotes → Campaigns.");
    if (r === "error") setError(params.get("msg") || "Couldn't connect. Please try again.");
    if (r) document.getElementById("social")?.scrollIntoView({ behavior: "smooth" });
  }, [params]);

  async function connect(login: "meta" | "google") {
    setBusy(login);
    try { window.location.href = (await api.post<{ url: string }>(`/social/${login}/connect`)).url; }
    catch (e) { setError((e as Error).message); setBusy(null); }
  }
  async function disconnect(login: "meta" | "google") {
    if (!window.confirm(login === "meta" ? "Disconnect Facebook and Instagram?" : "Disconnect YouTube?")) return;
    setSt(await api.del<SocialStatus>(`/social/${login}`));
    toast("Disconnected");
  }
  async function choose(a: SocialAccount) { setSt(await api.post<SocialStatus>(`/social/accounts/${a.id}/select`)); }
  const { business, setBusiness } = useSession();
  const autoOn = business.social_auto_reply ?? true;
  async function setAuto(on: boolean) {
    try { setBusiness(await api.patch<Business>("/business", { social_auto_reply: on })); toast(on ? "Comments get the offer link automatically" : "Automatic replies to comments are off"); }
    catch (e) { toast((e as Error).message); }
  }

  const logins = [
    { id: "meta" as const, title: "Facebook & Instagram", ready: st?.meta_ready, providers: ["facebook", "instagram"],
      help: "Log in with the Facebook account that manages your business Page. Your Instagram must be a Business or Creator account linked to that Page." },
    { id: "google" as const, title: "YouTube", ready: st?.google_ready, providers: ["youtube"],
      help: "Log in with the Google account that owns your business YouTube channel. Campaigns are posted as short videos (Shorts)." },
  ];
  return (
    <section className="panel" style={{ marginTop: 16 }} id="social">
      <h2>Social media <span className="muted small">post campaigns straight from {site.name}</span></h2>
      <ErrorBox error={error} />
      {!st ? null : logins.map((l) => {
        const accs = st.accounts.filter((a) => l.providers.includes(a.provider));
        return (
          <div className="soc-group" key={l.id}>
            <h3>
              <span>{l.title}</span>
              {l.ready ? (
                <span className="acts" style={{ flexWrap: "nowrap" }}>
                  <button className={`btn sm${accs.length ? "" : " primary"}`} disabled={busy === l.id} onClick={() => connect(l.id)}>{busy === l.id ? "Opening…" : accs.length ? "Reconnect" : "Connect"}</button>
                  {accs.length > 0 && <button className="btn sm ghost danger" onClick={() => disconnect(l.id)}>Disconnect</button>}
                </span>
              ) : <span className="muted small" style={{ fontWeight: 400 }}>Not available yet</span>}
            </h3>
            {accs.length === 0 ? <p className="muted small" style={{ margin: 0 }}>{l.ready ? l.help : "The platform owner hasn't switched this on yet."}</p> : (
              <div className="list">
                {accs.map((a) => {
                  const p = PLATFORMS.find((x) => x.id === a.provider)!;
                  const several = accs.filter((x) => x.provider === a.provider).length > 1;
                  return (
                    <div className="row" key={a.id}>
                      <div className="soc-acc">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {a.picture_url ? <img src={a.picture_url} alt="" /> : <span className="soc-ph" style={{ background: p.color }}>{p.label[0]}</span>}
                        <div className="l"><b>{a.name}</b><div className={a.error ? "bad-text" : ""}>{a.error ?? `${p.label}${a.handle ? ` · ${a.handle.startsWith("@") ? a.handle : "@" + a.handle}` : ""}`}</div></div>
                      </div>
                      {several ? (a.selected ? <Pill status="accepted" label="Posting here" /> : <button className="btn sm" onClick={() => choose(a)}>Post here instead</button>)
                        : <Pill status="accepted" label="Connected" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {st?.accounts.some((a) => a.provider === "facebook" || a.provider === "instagram") && (
        <div className="soc-group">
          <h3><span>Comments, likes and messages</span></h3>
          <p className="muted small" style={{ margin: "0 0 10px" }}>
            Everyone who comments on a campaign post, likes it on Facebook, or messages your Page or Instagram appears in Leads &amp; Enquiries,
            where you can reply. (Instagram doesn&apos;t share likes.)
          </p>
          <label className="check" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <input type="checkbox" checked={autoOn} onChange={(e) => setAuto(e.target.checked)} />
            <span><b>Reply to comments automatically</b><br />
              <span className="small muted">Sends each person who comments on a campaign a private message with the offer link, so they can accept and book. Messages to your Page get your automatic reply.</span></span>
          </label>
        </div>
      )}
    </section>
  );
}
