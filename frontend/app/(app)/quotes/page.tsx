"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { AddonGate, ChannelIcon, Steps, useCampaignsOn } from "@/components/QuoteCampaign";
import { useSession } from "@/components/session";
import { Tip } from "@/components/Tips";
import { copyText, ErrorBox, Loading, PageHead, Pill, QuotePill } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtDay, fmtTime, money, uaeDate } from "@/lib/format";
import type { Campaign, Quote } from "@/lib/types";
import { WA_LABEL } from "@/lib/whatsapp";

type Tab = "quotes" | "campaigns";

export default function QuoteCampaignPage() {
  return <Suspense fallback={<Loading />}><QuoteCampaign /></Suspense>;
}

const waiting = (q: Quote) => q.status === "sent" || q.status === "viewed";

/** Quote & Campaign: the two ways to send an offer, side by side, then everything sent so far. */
function QuoteCampaign() {
  const params = useSearchParams();
  const router = useRouter();
  const on = useCampaignsOn();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "campaigns" ? "campaigns" : "quotes");
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [camps, setCamps] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.swr<Quote[]>("/quotes", setQuotes).catch((e) => setError(e.message));
    if (on) api.swr<Campaign[]>("/campaigns", setCamps).catch(() => setCamps([]));
  }, [on]);
  const go = (t: Tab) => { setTab(t); router.replace(`/quotes?tab=${t}`, { scroll: false }); };
  const live = (camps ?? []).filter((c) => c.active && !c.expired);

  return (
    <>
      <PageHead title="Quote & Campaign" eyebrow="Your offers"
        sub="Make an offer once, then choose how it goes out: a quote to your clients on WhatsApp, or a campaign for social media and client groups." />
      <ErrorBox error={error} />

      <div className="qc-choices">
        <article className="qc-choice">
          <div className="qc-choice-top">
            <span className="qc-ico">{Icon.quotes()}</span>
            <div>
              <h2>Quote</h2>
              <p className="qc-for">For your clients, sent on WhatsApp</p>
            </div>
          </div>
          <Steps steps={["Add services & price, or a picture", "Pick one or many clients, or add a new one", "Send on WhatsApp. They accept from the link"]} />
          <div className="qc-stats">
            <span><b>{quotes ? quotes.filter(waiting).length : "–"}</b> waiting</span>
            <span><b>{quotes ? quotes.filter((q) => q.status === "accepted").length : "–"}</b> accepted</span>
          </div>
          <Tip id="qc.quote" order={1} text="One quote, sent to one client or a whole list. Each client gets their own link to accept.">
            <Link className="btn primary qc-go" href="/quotes/new">{Icon.quotes()}New quote</Link>
          </Tip>
        </article>

        <article className={`qc-choice camp-choice${on ? "" : " is-locked"}`}>
          {!on && <span className="addon-badge">Add-on</span>}
          <div className="qc-choice-top">
            <span className="qc-ico">{Icon.campaign()}</span>
            <div>
              <h2>Campaign</h2>
              <p className="qc-for">For everyone: social media & client groups</p>
            </div>
          </div>
          <div className="qc-channels" aria-label="Where a campaign can go">
            <span>{ChannelIcon.facebook()}Facebook</span>
            <span>{ChannelIcon.instagram()}Instagram</span>
            <span>{ChannelIcon.whatsapp()}WhatsApp group</span>
            <span>{ChannelIcon.link()}Link & QR</span>
          </div>
          <Steps steps={["Create the offer and its picture", "Choose where it goes", "See who accepts and books"]} />
          {on ? (
            <>
              <div className="qc-stats">
                <span><b>{camps ? live.length : "–"}</b> live</span>
                <span><b>{camps ? camps.reduce((a, c) => a + c.accepted, 0) : "–"}</b> accepted</span>
              </div>
              <Link className="btn primary qc-go" href="/quotes/campaigns/new">{Icon.campaign()}New campaign</Link>
            </>
          ) : <AddonGate compact />}
        </article>
      </div>

      <div className="qc-tabs" role="tablist" aria-label="Sent so far">
        <button type="button" role="tab" aria-selected={tab === "quotes"} onClick={() => go("quotes")}>Quotes <span>{quotes?.length ?? ""}</span></button>
        <button type="button" role="tab" aria-selected={tab === "campaigns"} onClick={() => go("campaigns")}>Campaigns <span>{on ? camps?.length ?? "" : "Add-on"}</span></button>
      </div>
      {tab === "quotes" ? <QuoteList quotes={quotes} /> : on ? <CampaignList rows={camps} /> : <AddonGate />}
    </>
  );
}

const FILTERS = [
  ["all", "All"], ["open", "Waiting"], ["awaiting", "Accepted, to book"], ["booked", "Booked"], ["declined", "Declined"],
] as const;
type Filter = (typeof FILTERS)[number][0];
const match = (q: Quote, f: Filter) =>
  f === "all" || (f === "open" && waiting(q)) || (f === "awaiting" && q.status === "accepted" && q.booking_status === "awaiting")
  || (f === "booked" && q.status === "accepted" && q.booking_status === "confirmed") || (f === "declined" && q.status === "rejected");

function QuoteList({ quotes }: { quotes: Quote[] | null }) {
  const { business } = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  if (!quotes) return <Loading />;
  const t = q.trim().toLowerCase();
  const rows = quotes.filter((x) => match(x, filter) && (!t || x.customer.name.toLowerCase().includes(t) || x.label.toLowerCase().includes(t)));
  return (
    <>
      <div className="filters">
        {FILTERS.map(([k, label]) => (
          <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label} <span className="mono">{quotes.filter((x) => match(x, k)).length}</span></button>
        ))}
        <input className="qc-search" type="search" placeholder="Search client or quote number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search quotes" />
      </div>
      <div className="tablewrap">
        <table className="ctable">
          <thead><tr><th>Quote</th><th>Client</th><th className="num">Total</th><th>Status</th><th>Booking</th><th /></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td className="c-stat c-first c-label"><Link className="rowlink mono" href={`/quotes/${x.id}`}>{x.label}</Link><div className="sub">{x.kind === "campaign" ? `From campaign · ${x.campaign_title ?? ""}` : fmtDate(x.created_at)}</div></td>
                <td className="c-main"><b className="c-name">{x.customer.name}</b><div className="sub">{x.reference || x.items.map((i) => i.description).join(", ") || (x.attachment ? `Brochure: ${x.attachment.name}` : "")}</div></td>
                <td className="num c-end">{money(x.totals.total, business.currency)}</td>
                <td className="c-stat"><QuotePill q={x} />{x.status !== "accepted" && <div className="sub">{x.view_count ? `Opened ${x.view_count}× · ${fmtDateTime(x.views[x.views.length - 1])}` : x.wa_status ? <span className={`wa-tick ${x.wa_status}`}>{WA_LABEL[x.wa_status]}</span> : "Not opened yet"}</div>}</td>
                <td className="c-stat" data-label="Booking">
                  {x.appointment_at ? <Link href={`/appointments?id=${x.appointment_id}`}>{fmtDay(uaeDate(x.appointment_at))}, {fmtTime(x.appointment_at)}</Link> : x.booking_status === "awaiting" ? <span className="muted">Not booked yet</span> : "—"}
                </td>
                <td className="c-acts">
                  <div className="acts">
                    {waiting(x) && x.whatsapp_url && <a className="btn sm wa" href={x.whatsapp_url} target="_blank" rel="noreferrer">WhatsApp</a>}
                    <Link className="btn sm" href={`/quotes/${x.id}`}>Open</Link>
                    {x.status === "accepted" && x.booking_status !== "confirmed" && <Link className="btn sm primary" href={`/appointments?quote=${x.id}`}>Book</Link>}
                    {x.service_record_id && <Pill status="done" label="Visit done" />}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="empty">{quotes.length ? "No quotes match." : <>No quotes yet. <Link href="/quotes/new">Send your first quote</Link>.</>}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CampaignList({ rows }: { rows: Campaign[] | null }) {
  const { business } = useSession();
  if (!rows) return <Loading />;
  if (!rows.length) return (
    <div className="panel empty" style={{ padding: 40 }}>
      <p style={{ margin: "0 0 14px" }}>No campaigns yet. Make an offer like “Bridal package AED 1,500 until 30 Nov”, then post it to Facebook and Instagram or send it to a client group.</p>
      <Link className="btn primary" href="/quotes/campaigns/new">Create a campaign</Link>
    </div>
  );
  return (
    <div className="camps">
      {rows.map((c) => (
        <article className="camp" key={c.id}>
          <Link href={`/quotes/campaigns/${c.id}`} className="camp-picwrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="camp-pic" src={`/api/public/c/${c.token}/image/portrait.jpg?v=${c.image_version}`} alt="" loading="lazy" />
          </Link>
          <div className="camp-top">
            <div>
              <Link className="camp-title" href={`/quotes/campaigns/${c.id}`}>{c.title}</Link>
              <div className="muted small">{c.items.map((i) => i.description).join(" + ")}</div>
            </div>
            {!c.active ? <Pill status="neutral" label="Paused" /> : c.expired ? <Pill status="expired" label="Ended" /> : <Pill status="accepted" label="Live" />}
          </div>
          <div className="camp-price">{money(c.totals.total, business.currency)}{c.valid_until && <span className="muted small"> · until {fmtDate(c.valid_until)}</span>}</div>
          <div className="qrstats">
            <div><b>{c.views}</b><span>Views</span></div>
            <div><b>{c.accepted}</b><span>Accepted</span></div>
            <div><b>{c.booked}</b><span>Booked</span></div>
          </div>
          <div className="acts" style={{ justifyContent: "flex-start" }}>
            {c.active && !c.expired && <Link className="btn sm primary" href={`/quotes/campaigns/${c.id}?launch=social`}>Send it out</Link>}
            <Link className="btn sm" href={`/quotes/campaigns/${c.id}`}>Open</Link>
            <button className="btn sm ghost" onClick={() => copyText(c.public_url)}>Copy link</button>
          </div>
        </article>
      ))}
    </div>
  );
}
