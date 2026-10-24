"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Social } from "@/components/icons";
import { api } from "@/lib/api";
import { addDays, fmtDay, todayUAE } from "@/lib/format";
import { site } from "@/lib/site";
import type { PublicLinkPage, PublicMenuItem } from "@/lib/types";
import { duration, TIME_SLOTS } from "@/lib/vocab";
import { BriskMark } from "@/components/Logo";
import { words } from "@/lib/words";

type Tap = "whatsapp" | "call" | "instagram" | "tiktok" | "snapchat" | "facebook" | "maps" | "link";
const SOCIAL_ORDER = ["instagram", "tiktok", "snapchat", "facebook"] as const;
const SOCIAL_NAME = { instagram: "Instagram", tiktok: "TikTok", snapchat: "Snapchat", facebook: "Facebook" };

/** The salon's link-in-bio page. `preview` = owner's editor (no visit counted, taps don't navigate). */
export function LinkPageView({ slug, initial, preview = false, demo = false }: { slug: string; initial: PublicLinkPage | null; preview?: boolean; demo?: boolean }) {
  const [p, setP] = useState<PublicLinkPage | null>(initial);
  const [missing, setMissing] = useState(false);
  const [booking, setBooking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [openCat, setOpenCat] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    api.get<PublicLinkPage>(`/public/b/${slug}${preview ? "?preview=1" : ""}`).then(setP).catch(() => !initial && setMissing(true));
    // The editor refreshes the preview when something is saved.
    const onMsg = (e: MessageEvent) => {
      if (e.data === "linkpage:refresh") api.get<PublicLinkPage>(`/public/b/${slug}?preview=1`).then(setP).catch(() => {});
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [slug, preview, initial, demo]);

  const groups = useMemo(() => {
    const g = new Map<string, PublicMenuItem[]>();
    (p?.menu ?? []).forEach((m) => g.set(m.category || "Services", [...(g.get(m.category || "Services") ?? []), m]));
    return [...g.entries()];
  }, [p]);
  useEffect(() => { if (groups.length && openCat === null) setOpenCat(groups[0][0]); }, [groups, openCat]);

  if (missing) return <div className="lk lk-clay"><div className="lk-in"><p className="lk-gone">This page doesn't exist. Check the link and try again.</p></div></div>;
  if (!p) return <div className="lk lk-clay" />;

  const b = p.business;
  async function tap(kind: Tap, linkId?: number) {
    if (preview || demo) return;
    try {
      const { url } = await api.post<{ url: string }>(`/public/b/${slug}/tap`, { kind, link_id: linkId ?? null });
      window.location.href = url;
    } catch { /* the button just does nothing if the salon removed it */ }
  }
  const toggle = (name: string) => setPicked((xs) => (xs.includes(name) ? xs.filter((x) => x !== name) : [...xs, name]));
  const price = (m: PublicMenuItem) => `${m.price_from ? "from " : ""}${p.currency} ${Number(m.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  let n = 0; // stagger index for the entrance
  const st = () => ({ "--i": n++ }) as React.CSSProperties;

  return (
    <div className={`lk lk-${p.theme} lk-m-${p.motion}${preview ? " lk-preview" : ""}${b.business_type === "real_estate" ? " lk-re" : ""}`}>
      {p.motion === "drift" && <div className="lk-drift" aria-hidden="true"><i /><i /><i /></div>}
      <div className="lk-in">
        <header className="lk-hero">
          <div className="lk-mirror" aria-hidden="true"><span>{b.initials}</span><em className="lk-sheen" /></div>
          <h1 className="lk-st" style={st()}>{b.name}</h1>
          {(p.bio || b.tagline) && <p className="lk-bio lk-st" style={st()}>{p.bio || b.tagline}</p>}
          {Object.keys(p.socials).length > 0 && (
            <nav className="lk-socials lk-st" style={st()} aria-label="Social media">
              {SOCIAL_ORDER.filter((k) => p.socials[k]).map((k) => (
                <a key={k} href={p.socials[k]} onClick={(e) => { e.preventDefault(); tap(k); }} aria-label={SOCIAL_NAME[k]}>{Social[k]()}</a>
              ))}
            </nav>
          )}
        </header>

        <div className="lk-actions">
          {p.booking && <button type="button" className="lk-btn lk-primary lk-st" style={st()} onClick={() => setBooking(true)}>{words(b.business_type).bookCta}</button>}
          {b.whatsapp_url && <button type="button" className="lk-btn lk-st" style={st()} onClick={() => tap("whatsapp")}>{Social.whatsapp()}Message us on WhatsApp</button>}
          {p.links.map((l) => (
            <button key={l.id} type="button" className={`lk-btn lk-st${l.highlight ? " lk-hl" : ""}`} style={st()} onClick={() => tap("link", l.id)}>
              {l.label}{Social.arrow()}
            </button>
          ))}
          {b.phone && <button type="button" className="lk-btn lk-quiet lk-st" style={st()} onClick={() => tap("call")}>{Social.phone()}Call {b.phone}</button>}
        </div>

        {groups.length > 0 && (
          <section className="lk-menu lk-st" style={st()} aria-labelledby="lk-menu-h">
            <h2 id="lk-menu-h">{b.business_type === "real_estate" ? "Listings" : "Menu"}</h2>
            {groups.length > 1 && (
              <div className="lk-cats" role="tablist" aria-label="Menu sections">
                {groups.map(([cat]) => (
                  <button key={cat} type="button" role="tab" aria-selected={openCat === cat} onClick={() => setOpenCat(cat)}>{cat}</button>
                ))}
              </div>
            )}
            {groups.filter(([cat]) => groups.length === 1 || cat === openCat).map(([cat, items]) => (
              <ul key={cat} className="lk-items" role={groups.length > 1 ? "tabpanel" : undefined} aria-label={cat}>
                {items.map((m) => {
                  const on = picked.includes(m.name);
                  return (
                    <li key={m.name}>
                      <div className="lk-item-l">
                        <b>{m.name}</b>
                        <span>{[p.show_prices && price(m), duration(m.duration_min)].filter(Boolean).join(" · ")}</span>
                      </div>
                      {p.booking && (
                        <button type="button" className={`lk-add${on ? " on" : ""}`} aria-pressed={on} aria-label={`${on ? "Remove" : "Add"} ${m.name}`} onClick={() => toggle(m.name)}>
                          {on ? "✓" : "+"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ))}
          </section>
        )}

        {p.team.length > 0 && (
          <section className="lk-team lk-st" style={st()} aria-labelledby="lk-team-h">
            <h2 id="lk-team-h">Our team</h2>
            <ul>
              {p.team.map((m) => (
                <li key={m.id}><i style={{ background: m.color }} aria-hidden="true">{m.initials}</i><b>{m.name.split(" ")[0]}</b>{m.role && <span>{m.role}</span>}</li>
              ))}
            </ul>
          </section>
        )}

        {(b.address || p.hours) && (
          <section className="lk-visit lk-st" style={st()}>
            {p.hours && <p>{Social.clock()}<span>{p.hours}</span></p>}
            {b.address && (
              <p>{Social.pin()}<span>{b.address}{p.maps_url && <> · <a href={p.maps_url} onClick={(e) => { e.preventDefault(); tap("maps"); }}>Directions</a></>}</span></p>
            )}
          </section>
        )}

        <a className="lk-made" href="/" target="_blank" rel="noreferrer"><BriskMark size={16} tile="currentColor" ink="var(--bg, #fff)" spark="var(--bg, #fff)" />Made with {site.name}</a>
      </div>

      {p.booking && picked.length > 0 && !booking && (
        <div className="lk-cart" role="status">
          <span>{picked.length} selected</span>
          <button type="button" onClick={() => setBooking(true)}>Request these</button>
        </div>
      )}
      {booking && <BookingSheet slug={slug} page={p} picked={picked} setPicked={setPicked} preview={preview || demo} onClose={() => setBooking(false)} />}
    </div>
  );
}

function BookingSheet({ slug, page, picked, setPicked, preview, onClose }: {
  slug: string; page: PublicLinkPage; picked: string[]; setPicked: (x: string[]) => void; preview: boolean; onClose: () => void;
}) {
  const [f, setF] = useState({ name: "", phone: "", date: "", time: "", stylist: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ whatsapp_url: string | null } | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const days = Array.from({ length: 14 }, (_, i) => addDays(todayUAE(), i));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return setError("This is a preview, so nothing was sent. Clients send requests from the live page.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ whatsapp_url: string | null }>(`/public/b/${slug}/book`, {
        name: f.name, phone: f.phone, services: picked, preferred_date: f.date || null, preferred_time: f.time || null,
        stylist: f.stylist || null, note: f.note || null,
      });
      setDone(r);
      setPicked([]);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="lk-sheet" role="dialog" aria-modal="true" aria-labelledby="lk-book-h" onClick={onClose}>
      <div className="lk-sheet-in" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="lk-done">
            <div className="lk-done-arch" aria-hidden="true">✓</div>
            <h2 id="lk-book-h">Request sent</h2>
            <p>Thanks, {f.name.split(" ")[0]}. {page.business.name} will message you to confirm a time.</p>
            {done.whatsapp_url && <a className="lk-btn lk-primary" href={done.whatsapp_url}>{Social.whatsapp()}Also send it on WhatsApp</a>}
            <button type="button" className="lk-btn lk-quiet" onClick={onClose}>Back to the page</button>
          </div>
        ) : (
          <form onSubmit={send}>
            <div className="lk-sheet-head">
              <h2 id="lk-book-h">{words(page.business.business_type).bookCta}</h2>
              <button type="button" className="lk-x" onClick={onClose} aria-label="Close">×</button>
            </div>
            {page.menu.length > 0 && (
              <fieldset>
                <legend>What would you like?</legend>
                <div className="lk-chips">
                  {page.menu.map((m) => (
                    <button type="button" key={m.name} aria-pressed={picked.includes(m.name)} onClick={() => setPicked(picked.includes(m.name) ? picked.filter((x) => x !== m.name) : [...picked, m.name])}>{m.name}</button>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset>
              <legend>Which day suits you?</legend>
              <div className="lk-days">
                {days.map((d) => {
                  const dt = new Date(d + "T12:00:00+04:00");
                  return (
                    <button type="button" key={d} aria-pressed={f.date === d} onClick={() => setF({ ...f, date: f.date === d ? "" : d })} aria-label={fmtDay(d)}>
                      <span>{d === todayUAE() ? "Today" : dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Dubai" })}</span>
                      <b>{dt.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Asia/Dubai" })}</b>
                    </button>
                  );
                })}
              </div>
              <div className="lk-chips" style={{ marginTop: 8 }}>
                {TIME_SLOTS.map((t) => <button type="button" key={t} aria-pressed={f.time === t} onClick={() => setF({ ...f, time: f.time === t ? "" : t })}>{t}</button>)}
              </div>
            </fieldset>
            {page.team.length > 0 && (
              <fieldset>
                <legend>Anyone in particular?</legend>
                <div className="lk-chips">
                  <button type="button" aria-pressed={!f.stylist} onClick={() => setF({ ...f, stylist: "" })}>No preference</button>
                  {page.team.map((m) => <button type="button" key={m.id} aria-pressed={f.stylist === m.name} onClick={() => setF({ ...f, stylist: m.name })}>{m.name.split(" ")[0]}</button>)}
                </div>
              </fieldset>
            )}
            <label>Your name<input ref={first} required value={f.name} onChange={set("name")} autoComplete="name" maxLength={160} /></label>
            <label>Mobile number<input required minLength={6} value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="050 123 4567" /></label>
            <label>Anything we should know? <span className="lk-opt">Optional</span><textarea value={f.note} onChange={set("note")} maxLength={1000} placeholder="Hair length, inspiration photo on WhatsApp, first visit…" /></label>
            {error && <p className="lk-err" role="alert">{error}</p>}
            <button className="lk-btn lk-primary" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
            <p className="lk-fine">{page.business.name} will confirm your time on WhatsApp or by phone.</p>
          </form>
        )}
      </div>
    </div>
  );
}
