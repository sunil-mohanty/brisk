"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Social } from "@/components/icons";
import { useSession } from "@/components/session";
import { Tip } from "@/components/Tips";
import { copyText, ErrorBox, Loading, PageHead, toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Business, LinkItem, LinkMotion, LinkPage, LinkTheme } from "@/lib/types";

const THEMES: [LinkTheme, string, string, string][] = [
  ["clay", "Clay", "#f3eadf", "#a4452a"],
  ["sand", "Sand", "#efe5d3", "#8a6a3a"],
  ["rose", "Rose", "#f5e5e1", "#a8505f"],
  ["sage", "Sage", "#e8eadf", "#56663f"],
  ["navy", "Navy", "#eef0f3", "#1f3a5f"],
  ["noir", "Noir", "#1d1714", "#d9946a"],
];
const MOTIONS: [LinkMotion, string, string][] = [
  ["bloom", "Bloom", "Your mirror rises in, then the page"],
  ["shimmer", "Shimmer", "Light glints across the mirror and buttons"],
  ["drift", "Drift", "Soft shapes float slowly behind"],
  ["calm", "Still", "No animation"],
];

export default function LinkPageEditor() {
  const { business, setBusiness } = useSession();
  const [p, setP] = useState<LinkPage | null>(null);
  const [f, setF] = useState({ slug: "", bio: "", hours: "", maps_url: "", instagram: "", tiktok: "", snapchat: "", facebook: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  const fill = useCallback((x: LinkPage) => {
    setP(x);
    setF({ slug: x.slug ?? "", bio: x.bio ?? "", hours: x.hours ?? "", maps_url: x.maps_url ?? "", instagram: x.instagram ?? "", tiktok: x.tiktok ?? "", snapchat: x.snapchat ?? "", facebook: x.facebook ?? "" });
  }, []);
  useEffect(() => { api.get<LinkPage>("/linkpage").then(fill).catch((e) => setError(e.message)); }, [fill]);

  const refresh = () => frame.current?.contentWindow?.postMessage("linkpage:refresh", "*");
  const changed = p && (Object.keys(f) as (keyof typeof f)[]).some((k) => (f[k] || "") !== ((p[k] as string | null) ?? ""));

  async function patch(body: Partial<LinkPage>, msg?: string) {
    setError(null);
    try {
      const x = await api.patch<LinkPage>("/linkpage", body);
      const slugChanged = x.slug !== p?.slug;
      fill(x);
      if (slugChanged) setBusiness({ ...business, slug: x.slug } as Business);
      if (msg) toast(msg);
      if (slugChanged && frame.current) frame.current.src = `/${x.slug}?preview=1`;
      else refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  async function saveText(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await patch(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, k === "slug" ? v.trim().toLowerCase() : v.trim() || null])), "Link page saved");
    setBusy(false);
  }

  async function links(path: string, method: "post" | "patch" | "del", body?: unknown) {
    try {
      const x = method === "del" ? await api.del(path).then(() => api.get<LinkPage>("/linkpage")) : await api[method]<LinkPage>(path, body);
      setP(x);
      refresh();
    } catch (e) { toast((e as Error).message); }
  }

  if (!business.link_page_enabled) return (
    <>
      <PageHead title="Link page" eyebrow="Not switched on" />
      <div className="panel empty" style={{ padding: 40 }}>The link page isn&apos;t switched on for your business yet. Message us on WhatsApp and we&apos;ll turn it on.</div>
    </>
  );
  if (error && !p) return <ErrorBox error={error} />;
  if (!p) return <Loading />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const host = typeof window !== "undefined" ? window.location.host : "";
  const share = `https://wa.me/?text=${encodeURIComponent(`Book with ${business.name}: ${p.url}`)}`;
  const taps = Object.values(p.taps_7d).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHead
        eyebrow="For your Instagram, TikTok and Snapchat bio"
        title="Link page"
        sub="One link with your menu, team, WhatsApp and a booking request form. Requests arrive in Enquiries."
        action={
          <div className="acts">
            <button className="btn" onClick={() => p.url && copyText(p.url)}>Copy link</button>
            <a className="btn primary" href={`/${p.slug}`} target="_blank" rel="noreferrer">Open my page</a>
          </div>
        }
      />
      <div className="lp-edit">
        <div className="stack">
          <ErrorBox error={error} />
          <form className="card" onSubmit={saveText}>
            <div className="form">
              <label className="full">
                Your page address
                <Tip id="lp.slug" order={1} text="Put this link in your Instagram and TikTok bio. Keep it short and easy to read.">
                  <span className="slugfield"><span>{host}/</span><input id="lp-slug" value={f.slug} onChange={set("slug")} maxLength={40} autoCapitalize="none" spellCheck={false} /></span>
                </Tip>
                <span className="hint">Letters, numbers and dashes. Changing it breaks the old link, so change it before you share it.</span>
              </label>
              <label className="full">About you<textarea id="lp-bio" value={f.bio} onChange={set("bio")} maxLength={300} placeholder="Unisex salon in Al Barsha. Colour, cuts, nails and bridal. Walk-ins welcome." /></label>
              <label>Opening hours<input id="lp-hours" value={f.hours} onChange={set("hours")} maxLength={200} placeholder="Daily 10am – 10pm · Fri from 2pm" /></label>
              <label>Google Maps link<input id="lp-maps" value={f.maps_url} onChange={set("maps_url")} placeholder="Paste from Google Maps → Share" /></label>
              <label className="handle">Instagram{Social.instagram()}<input id="lp-ig" value={f.instagram} onChange={set("instagram")} placeholder="yourbusiness" autoCapitalize="none" /></label>
              <label className="handle">TikTok{Social.tiktok()}<input id="lp-tt" value={f.tiktok} onChange={set("tiktok")} placeholder="yourbusiness" autoCapitalize="none" /></label>
              <label className="handle">Snapchat{Social.snapchat()}<input id="lp-sc" value={f.snapchat} onChange={set("snapchat")} placeholder="yourbusiness" autoCapitalize="none" /></label>
              <label className="handle">Facebook{Social.facebook()}<input id="lp-fb" value={f.facebook} onChange={set("facebook")} placeholder="Page name or link" autoCapitalize="none" /></label>
            </div>
            <div className="foot"><button className="btn primary" disabled={busy || !changed}>{busy ? "Saving…" : changed ? "Save changes" : "Saved"}</button></div>
          </form>

          <section className="panel">
            <h2>Look</h2>
            <Tip id="lp.look" order={2} text="Pick colours that match your brand. The preview updates straight away.">
              <div className="swatches" role="group" aria-label="Colours">
                {THEMES.map(([id, name, bg, ac]) => (
                  <button key={id} type="button" className="swatch" aria-pressed={p.link_theme === id} style={{ "--sw-bg": bg, "--sw-ac": ac } as React.CSSProperties} onClick={() => patch({ link_theme: id })}>
                    <i />{name}
                  </button>
                ))}
              </div>
            </Tip>
            <h3 className="subhead" style={{ borderTop: 0, paddingTop: 0, marginTop: 20 }}>Animation</h3>
            <div className="motions" role="group" aria-label="Animation">
              {MOTIONS.map(([id, name, desc]) => (
                <button key={id} type="button" className="motion" aria-pressed={p.link_motion === id} onClick={() => patch({ link_motion: id })}>
                  <b>{name}</b><span>{desc}</span>
                </button>
              ))}
            </div>
            <div className="itemfoot" style={{ marginTop: 16 }}>
              <label className="check"><input type="checkbox" checked={p.link_booking} onChange={(e) => patch({ link_booking: e.target.checked }, e.target.checked ? "Clients can request appointments" : "Booking requests switched off")} />Let clients request appointments</label>
              <label className="check"><input type="checkbox" checked={p.link_show_prices} onChange={(e) => patch({ link_show_prices: e.target.checked })} />Show prices on the menu</label>
            </div>
          </section>

          <section className="panel">
            <h2>Buttons <span className="muted small">{p.links.length} of 12</span></h2>
            <p className="muted small" style={{ marginTop: -6 }}>Extra links under WhatsApp: a lookbook, gift vouchers, your price list PDF, reviews.</p>
            <div className="linkrows">
              {p.links.map((l, i) => <LinkRow key={l.id} l={l} first={i === 0} last={i === p.links.length - 1}
                onSave={(body) => links(`/linkpage/links/${l.id}`, "patch", body)}
                onDelete={() => links(`/linkpage/links/${l.id}`, "del")}
                onMove={(d) => { const ids = p.links.map((x) => x.id); const j = i + d; [ids[i], ids[j]] = [ids[j], ids[i]]; links("/linkpage/links/order", "post", ids); }} />)}
            </div>
            <AddLink onAdd={(body) => links("/linkpage/links", "post", body)} disabled={p.links.length >= 12} />
          </section>

          <section className="panel">
            <h2>Also on your page</h2>
            <div className="list">
              <div className="row"><div className="l"><b>Service menu</b><div>Prices and times, grouped by category</div></div><Link className="btn sm" href="/menu">Edit menu</Link></div>
              <div className="row"><div className="l"><b>Your team</b><div>Clients can ask for someone by name</div></div><Link className="btn sm" href="/team">Edit team</Link></div>
              <div className="row"><div className="l"><b>WhatsApp, phone and address</b><div>From your profile</div></div><Link className="btn sm" href="/settings">Edit profile</Link></div>
            </div>
          </section>
          <div className="mobile-preview acts" style={{ justifyContent: "stretch" }}>
            <a className="btn primary" style={{ flex: 1 }} href={`/${p.slug}?preview=1`} target="_blank" rel="noreferrer">Preview my page</a>
            <a className="btn wa" style={{ flex: 1 }} href={share} target="_blank" rel="noreferrer">Share on WhatsApp</a>
          </div>
        </div>

        <aside className="lp-preview" aria-label="Preview">
          <div className="lp-device"><iframe ref={frame} title="Link page preview" src={`/${p.slug}?preview=1`} /></div>
          <div className="lp-stats">
            <div><b>{p.views_7d}</b><span>visits, 7 days</span></div>
            <div><b>{taps}</b><span>taps, 7 days</span></div>
            <div><b>{p.bookings_30d}</b><span>requests, 30 days</span></div>
          </div>
          <a className="btn wa" style={{ width: 340 }} href={share} target="_blank" rel="noreferrer">Share on WhatsApp</a>
        </aside>
      </div>
    </>
  );
}

function LinkRow({ l, first, last, onSave, onDelete, onMove }: { l: LinkItem; first: boolean; last: boolean; onSave: (b: Partial<LinkItem>) => void; onDelete: () => void; onMove: (d: -1 | 1) => void }) {
  return (
    <div className="linkrow">
      <span className="ord">
        <button type="button" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${l.label} up`}>▲</button>
        <button type="button" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${l.label} down`}>▼</button>
      </span>
      <input defaultValue={l.label} aria-label="Button text" maxLength={80} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== l.label && onSave({ label: e.target.value.trim() })} />
      <input defaultValue={l.url} aria-label="Link" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== l.url && onSave({ url: e.target.value.trim() })} />
      <label className="check" title="Highlight this button"><input type="checkbox" checked={l.highlight} onChange={(e) => onSave({ highlight: e.target.checked })} />Highlight<span className="clicks">· {l.clicks} taps</span></label>
      <button type="button" className="btn sm" onClick={onDelete} aria-label={`Remove ${l.label}`}>×</button>
    </div>
  );
}

function AddLink({ onAdd, disabled }: { onAdd: (b: { label: string; url: string }) => Promise<void>; disabled: boolean }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  return (
    <form className="plist-add" style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr auto", gap: 8, marginTop: 12 }} onSubmit={async (e) => { e.preventDefault(); if (!label.trim() || !url.trim()) return; await onAdd({ label: label.trim(), url: url.trim() }); setLabel(""); setUrl(""); }}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Button text, e.g. Bridal lookbook" aria-label="Button text" maxLength={80} disabled={disabled} />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link, e.g. yourbusiness.ae/offers" aria-label="Link" disabled={disabled} />
      <button className="btn" disabled={disabled || !label.trim() || !url.trim()}>Add button</button>
    </form>
  );
}
