"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { CampaignForm } from "@/components/CampaignForm";
import { copyText, ErrorBox, Loading, PageHead, QuotePill, toast } from "@/components/ui";
import { useSession } from "@/components/session";
import { api, download } from "@/lib/api";
import { fmtDate, fmtDay, fmtTime, money, uaeDate } from "@/lib/format";
import type { Campaign, Quote } from "@/lib/types";
import { duration } from "@/lib/vocab";
import { SocialPost } from "@/components/SocialPost";

export default function CampaignPage() {
  return <Suspense fallback={<Loading />}><CampaignDetail /></Suspense>;
}

function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const editing = useSearchParams().get("edit") === "1";
  const router = useRouter();
  const { business } = useSession();
  const [c, setC] = useState<Campaign | null>(null);
  const [responses, setResponses] = useState<Quote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.get<Campaign>(`/campaigns/${id}`).then(setC).catch((e) => setError(e.message));
    api.get<Quote[]>(`/campaigns/${id}/responses`).then(setResponses).catch(() => setResponses([]));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function setActive(active: boolean) {
    if (!c) return;
    const body = { title: c.title, description: c.description, items: c.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
      discount: Number(c.totals.discount), vat_rate: Number(c.vat_rate), valid_until: c.valid_until, duration_min: c.duration_min, notes: c.notes, active };
    try { setC(await api.put<Campaign>(`/campaigns/${c.id}`, body)); toast(active ? "Campaign is live again" : "Campaign paused. The link now says the offer has ended."); }
    catch (e) { toast((e as Error).message); }
  }
  async function remove() {
    if (!c || !window.confirm(`Delete “${c.title}”? Clients who already accepted keep their quotes.`)) return;
    await api.del(`/campaigns/${c.id}`);
    toast("Campaign deleted");
    router.push("/quotes?tab=campaigns");
  }

  if (error) return <ErrorBox error={error} />;
  if (!c) return <Loading />;
  if (editing) return <><PageHead title="Edit campaign" eyebrow={c.title} sub="Changes apply to new clients. Anyone who already accepted keeps the quote they accepted." /><CampaignForm campaign={c} /></>;
  const cur = business.currency;
  const safe = c.title.replace(/[^A-Za-z0-9_-]+/g, "-");

  return (
    <>
      <PageHead
        title={c.title}
        eyebrow={!c.active ? "Paused" : c.expired ? "Ended" : "Live"}
        sub={`${money(c.totals.total, cur)} · ${duration(c.duration_min)}${c.valid_until ? ` · until ${fmtDate(c.valid_until)}` : ""}`}
        action={<>
          <Link className="btn" href={`/quotes/campaigns/${c.id}?edit=1`}>Edit</Link>
          {c.active ? <button className="btn" onClick={() => setActive(false)}>Pause</button> : <button className="btn primary" onClick={() => setActive(true)}>Resume</button>}
        </>}
      />
      <div className="kpis" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="kpi"><span>Page views</span><strong>{c.views}</strong><em>people who opened the offer</em></div>
        <div className="kpi"><span>Accepted</span><strong>{c.accepted}</strong><em>{c.views ? `${Math.round((c.accepted / c.views) * 100)}% of views` : "no views yet"}</em></div>
        <div className="kpi"><span>Booked a time</span><strong>{c.booked}</strong><em>{c.accepted - c.booked} still to book in</em></div>
      </div>
      <SocialPost c={c} />
      <div className="detail" style={{ marginTop: 16 }}>
        <div className="stack">
          <section className="panel">
            <h2>Or share the link yourself <span className="muted small">TikTok, Snapchat, WhatsApp status, ads</span></h2>
            <div className="linkbox">
              <input readOnly value={c.public_url} onFocus={(e) => e.target.select()} aria-label="Campaign link" />
              <button className="btn" onClick={() => copyText(c.public_url)}>Copy link</button>
            </div>
            <p className="small muted" style={{ margin: "14px 0 6px" }}>Caption for your post or ad:</p>
            <p className="msg">{c.share_text}</p>
            <div className="acts" style={{ justifyContent: "flex-start" }}>
              <button className="btn" onClick={() => copyText(c.share_text)}>Copy caption</button>
              <a className="btn wa" href={`https://wa.me/?text=${encodeURIComponent(c.share_text)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
              <a className="btn" href={`/c/${c.token}?preview=1`} target="_blank" rel="noreferrer">Preview offer page</a>
            </div>
            {c.whatsapp_accept_url && (
              <>
                <p className="small muted" style={{ margin: "14px 0 6px" }}>&quot;Accept on WhatsApp&quot; link, for a WhatsApp button on an ad or a story. Clients accept and pick a time in the chat:</p>
                <div className="linkbox">
                  <input readOnly value={c.whatsapp_accept_url} onFocus={(e) => e.target.select()} aria-label="Accept on WhatsApp link" />
                  <button className="btn" onClick={() => copyText(c.whatsapp_accept_url!)}>Copy</button>
                </div>
              </>
            )}
          </section>
          <section className="panel">
            <h2>Clients who accepted <span className="muted small">{responses?.length ?? 0}</span></h2>
            {!responses ? <Loading /> : responses.length === 0 ? <div className="empty">Nobody yet. Share the link or QR code to start.</div> : (
              <div className="list">
                {responses.map((q) => (
                  <div className="row" key={q.id}>
                    <div className="l"><b>{q.customer.name}</b><div>{q.customer.phone} · {q.appointment_at ? `${fmtDay(uaeDate(q.appointment_at))}, ${fmtTime(q.appointment_at)}` : "no time booked"}</div></div>
                    <div className="acts" style={{ flexWrap: "nowrap" }}>
                      <QuotePill q={q} />
                      {q.booking_status !== "confirmed" && <Link className="btn sm primary" href={`/appointments?quote=${q.id}`}>Book</Link>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <div className="stack">
          <section className="panel" style={{ textAlign: "center" }}>
            <h2>QR code</h2>
            <QrPreview id={c.id} />
            <p className="small muted">For posters, flyers, video end screens and the mirror at reception.</p>
            <div className="acts" style={{ justifyContent: "center" }}>
              <button className="btn sm" onClick={() => download(`/campaigns/${c.id}/qr?fmt=png`, `${safe}.png`)}>PNG</button>
              <button className="btn sm" onClick={() => download(`/campaigns/${c.id}/qr?fmt=svg`, `${safe}.svg`)}>SVG for print</button>
            </div>
          </section>
          <section className="panel">
            <h2>The offer</h2>
            <div className="list">
              {c.items.map((i, n) => <div className="row" key={n}><div className="l"><b>{i.description}</b><div>{Number(i.quantity)} × {money(i.unit_price, cur)}</div></div><span className="mono">{money(i.line_total, cur)}</span></div>)}
            </div>
            <div className="totals">
              {Number(c.totals.discount) > 0 && <div><span>Discount</span><span className="mono">−{money(c.totals.discount, cur)}</span></div>}
              <div><span>VAT {Number(c.vat_rate)}%</span><span className="mono">{money(c.totals.vat, cur)}</span></div>
              <div className="grand"><span>Total</span><span className="mono">{money(c.totals.total, cur)}</span></div>
            </div>
            <button className="btn sm ghost danger" style={{ marginTop: 14 }} onClick={remove}>Delete campaign</button>
          </section>
        </div>
      </div>
    </>
  );
}

/** The QR image needs the sign-in token, so it's fetched rather than linked. */
function QrPreview({ id }: { id: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    const token = localStorage.getItem("salon_token");
    fetch(`/api/campaigns/${id}/qr`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="QR code for this campaign" width={180} height={180} style={{ imageRendering: "pixelated", borderRadius: 12, background: "#fff", padding: 6 }} /> : <div style={{ height: 192 }} />;
}
