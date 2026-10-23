"use client";

import { useCallback, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { copyText, ErrorBox, Loading, PageHead, toast } from "@/components/ui";
import { api, auth, download } from "@/lib/api";
import type { QR, QRDestination } from "@/lib/types";
import { MaybeTip, Tip } from "@/components/Tips";

export default function QRPage() {
  const [qrs, setQrs] = useState<QR[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.swr<QR[]>("/qr", setQrs).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function archive(q: QR) {
    await api.patch(`/qr/${q.id}`, { archived: true });
    toast(`${q.name} archived. Its printed code now shows "no longer active".`);
    load();
  }

  return (
    <>
      <PageHead
        eyebrow="Acquire"
        title="QR codes & links"
        sub="Make one for each place you advertise: shop counter, flyers, van, Instagram bio, an ad. Every scan or tap is counted, and each enquiry is tagged with where it came from."
        action={<Tip id="qr.create" order={1} text="Make one for each place you advertise. You get a QR to print and a link for Instagram or ads, and you'll see which one brings customers."><button className="btn primary" onClick={() => setCreating(true)}>+ Create QR or link</button></Tip>}
      />
      <ErrorBox error={error} />
      {!qrs ? <Loading /> : qrs.length === 0 ? (
        <div className="card empty">Make your first one, for example “Shop counter” to print, or “Instagram bio” to paste as a link.</div>
      ) : (
        <div className="qrgrid">
          {qrs.map((q, qi) => (
            <div className="qrcard" key={q.id}>
              <div className="top">
                <div className="code"><QrImage id={q.id} alt={`QR code for ${q.name}`} /></div>
                <div style={{ minWidth: 0 }}>
                  <h3>{q.name}</h3>
                  {q.campaign && <div className="meta">Note: {q.campaign}</div>}
                  <div className="meta">Opens: {q.destination === "whatsapp" ? "WhatsApp chat with you" : "Your business page"}</div>
                </div>
              </div>
              <div className="qrstats">
                <div><b>{q.scans}</b><span>Scans</span></div>
                <div><b>{q.clicks}</b><span>Taps</span></div>
                <div><b>{q.leads}</b><span>Leads</span></div>
              </div>
              <MaybeTip on={qi === 0} id="qr.link" order={2} text="Paste this link in your Instagram bio, WhatsApp status or ads. Every tap is counted here.">
              <div className="qrlink">
                <span className="small muted">Link for Instagram bio, ads or WhatsApp status</span>
                <div className="linkbox">
                  <input readOnly value={q.target_url} onFocus={(e) => e.target.select()} aria-label={`Link for ${q.name}`} />
                  <button className="btn" onClick={() => copyText(q.target_url).then(() => toast("Link copied. Paste it in your bio or ad."))}>Copy link</button>
                </div>
              </div>
              </MaybeTip>
              <div className="acts" style={{ justifyContent: "flex-start" }}>
                <span className="small muted" style={{ alignSelf: "center" }}>QR to print:</span>
                <button className="btn sm" onClick={() => download(`/qr/${q.id}/image?fmt=png`, `qr-${q.name}.png`)}>PNG</button>
                <button className="btn sm" onClick={() => download(`/qr/${q.id}/image?fmt=svg`, `qr-${q.name}.svg`)}>SVG for print</button>
                <button className="btn sm danger" onClick={() => archive(q)}>Archive</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Sheet open={creating} onClose={() => setCreating(false)}>
        <CreateQR existing={(qrs ?? []).map((q) => q.name)} onDone={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />
      </Sheet>
    </>
  );
}

const qrImages = new Map<number, string>();

function QrImage({ id, alt }: { id: number; alt: string }) {
  const [src, setSrc] = useState<string | null>(qrImages.get(id) ?? null);
  useEffect(() => {
    if (qrImages.has(id)) return setSrc(qrImages.get(id)!);
    let alive = true;
    fetch(`/api/qr/${id}/image?fmt=png`, { headers: { Authorization: `Bearer ${auth.get()}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        const url = URL.createObjectURL(b);
        qrImages.set(id, url);
        if (alive) setSrc(url);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [id]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} width={96} height={96} /> : <div style={{ width: 96, height: 96 }} />;
}

const PLACES = ["Shop counter", "Flyer", "Van / car", "Instagram bio", "Facebook page", "Google ad", "Business card"];

function CreateQR({ existing, onDone, onCancel }: { existing: string[]; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [campaign, setCampaign] = useState("");
  const [destination, setDestination] = useState<QRDestination>("landing");
  const [error, setError] = useState<string | null>(null);
  const taken = existing.some((n) => n.trim().toLowerCase() === name.trim().toLowerCase());
  async function save() {
    if (taken) return setError(`You already have one called “${name.trim()}”. Give this one a different name, e.g. “${name.trim()} – October”, so you can see which brings more customers.`);
    try {
      await api.post("/qr", { name: name.trim(), campaign: campaign.trim() || null, destination });
      toast("Ready. Print the QR or copy the link.");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <h2>New QR code or link</h2>
      <p className="intro">You get both: a QR to print and a link to paste. Name it after where you'll use it, so you can see which place brings in clients.</p>
      <ErrorBox error={error} />
      <div className="form" style={{ marginTop: 10 }}>
        <label className="full">
          Where will you use it?
          <input id="qr-name" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="Shop counter, Flyer, Instagram bio…" maxLength={80} />
        </label>
        <div className="full chips-inline">
          {PLACES.map((p) => <button type="button" key={p} className="chip" aria-pressed={name === p} onClick={() => { setName(p); setError(null); }}>{p}</button>)}
        </div>
        {taken && <p className="full small" style={{ margin: 0, color: "var(--warn)" }}>You already have one with this name. Add a word to tell them apart.</p>}
        <label className="full">
          When someone scans or taps it, open
          <select id="qr-dest" value={destination} onChange={(e) => setDestination(e.target.value as QRDestination)}>
            <option value="landing">Your business page (WhatsApp, call and enquiry form)</option>
            <option value="whatsapp">A WhatsApp chat with you, straight away</option>
          </select>
        </label>
        <label className="full">Note for you (optional)<input id="qr-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. October offer" maxLength={120} /></label>
      </div>
      <div className="foot">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={!name.trim()}>Create</button>
      </div>
    </>
  );
}
