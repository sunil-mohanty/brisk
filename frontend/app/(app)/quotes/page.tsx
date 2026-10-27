"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session";
import { Tip } from "@/components/Tips";
import { copyText, ErrorBox, Loading, PageHead, Pill, QuotePill } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtDay, fmtTime, money, uaeDate } from "@/lib/format";
import type { Campaign, Quote } from "@/lib/types";
import { WA_LABEL } from "@/lib/whatsapp";

type Tab = "clients" | "campaigns";

export default function QuotesPage() {
  return <Suspense fallback={<Loading />}><Quotes /></Suspense>;
}

function Quotes() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "campaigns" ? "campaigns" : "clients");
  const go = (t: Tab) => { setTab(t); router.replace(`/quotes?tab=${t}`, { scroll: false }); };
  return (
    <>
      <PageHead
        title="Quotes"
        eyebrow={tab === "clients" ? "Sent on WhatsApp" : "For social media & ads"}
        sub={tab === "clients"
          ? "Quotes for one client, or the same quote for many clients at once. Clients accept and book a time from the link."
          : "One public offer for Instagram, TikTok, YouTube or an ad. Anyone can accept it and book a free time."}
        action={tab === "clients" ? (
          <>
            <Link className="btn" href="/quotes/bulk">{Icon.customers()}For many clients</Link>
            <Tip id="q.new" order={1} text="A quote for one client, sent on WhatsApp. They accept it and can pick a time straight away."><Link className="btn primary" href="/quotes/new">{Icon.quotes()}New quote</Link></Tip>
          </>
        ) : <Link className="btn primary" href="/quotes/campaigns/new">{Icon.campaign()}New campaign</Link>}
      />
      <div className="tabs2" role="tablist" aria-label="Quote type">
        <button type="button" role="tab" aria-selected={tab === "clients"} onClick={() => go("clients")}>{Icon.enquiries()}<span><b>Client quotes</b><small>Specific or bulk clients · WhatsApp</small></span></button>
        <button type="button" role="tab" aria-selected={tab === "campaigns"} onClick={() => go("campaigns")}>{Icon.campaign()}<span><b>Campaign quotes</b><small>Social media, YouTube & ads</small></span></button>
      </div>
      {tab === "clients" ? <ClientQuotes /> : <Campaigns />}
    </>
  );
}

const FILTERS = [
  ["all", "All"], ["open", "Waiting for client"], ["awaiting", "Accepted · awaiting booking"], ["booked", "Accepted · booked"], ["declined", "Declined"],
] as const;
type Filter = (typeof FILTERS)[number][0];
const match = (q: Quote, f: Filter) =>
  f === "all" || (f === "open" && (q.status === "sent" || q.status === "viewed")) || (f === "awaiting" && q.status === "accepted" && q.booking_status === "awaiting")
  || (f === "booked" && q.status === "accepted" && q.booking_status === "confirmed") || (f === "declined" && q.status === "rejected");

function ClientQuotes() {
  const { business } = useSession();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.swr<Quote[]>("/quotes", setQuotes).catch((e) => setError(e.message)); }, []);
  const rows = (quotes ?? []).filter((q) => match(q, filter));
  return (
    <>
      <ErrorBox error={error} />
      <div className="filters">
        {FILTERS.map(([k, label]) => (
          <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label} <span className="mono">{(quotes ?? []).filter((q) => match(q, k)).length}</span></button>
        ))}
      </div>
      {!quotes ? <Loading /> : (
        <div className="tablewrap">
          <table className="ctable">
            <thead><tr><th>Quote</th><th>Client</th><th className="num">Total</th><th>Status</th><th>Booking</th><th /></tr></thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id}>
                  <td className="c-stat c-first c-label"><Link className="rowlink mono" href={`/quotes/${q.id}`}>{q.label}</Link><div className="sub">{q.kind === "campaign" ? `Campaign · ${q.campaign_title ?? ""}` : fmtDate(q.created_at)}</div></td>
                  <td className="c-main"><b className="c-name">{q.customer.name}</b><div className="sub">{q.items.map((i) => i.description).join(", ") || (q.attachment ? `Brochure: ${q.attachment.name}` : "")}</div></td>
                  <td className="num c-end">{money(q.totals.total, business.currency)}</td>
                  <td className="c-stat"><QuotePill q={q} />{q.status !== "accepted" && <div className="sub">{q.view_count ? `Opened ${q.view_count}× · ${fmtDateTime(q.views[q.views.length - 1])}` : q.wa_status ? <span className={`wa-tick ${q.wa_status}`}>{WA_LABEL[q.wa_status]}</span> : "Not opened yet"}</div>}</td>
                  <td className="c-stat" data-label="Booking">
                    {q.appointment_at ? <Link href={`/appointments?id=${q.appointment_id}`}>{fmtDay(uaeDate(q.appointment_at))}, {fmtTime(q.appointment_at)}</Link> : q.booking_status === "awaiting" ? <span className="muted">Not booked yet</span> : "—"}
                  </td>
                  <td className="c-acts">
                    <div className="acts">
                      {(q.status === "sent" || q.status === "viewed") && q.whatsapp_url && <a className="btn sm wa" href={q.whatsapp_url} target="_blank" rel="noreferrer">WhatsApp</a>}
                      <Link className="btn sm" href={`/quotes/${q.id}`}>Open</Link>
                      {q.status === "accepted" && q.booking_status !== "confirmed" && <Link className="btn sm primary" href={`/appointments?quote=${q.id}`}>Book</Link>}
                      {q.service_record_id && <Pill status="done" label="Visit done" />}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="empty">{quotes.length ? "No quotes with this status." : <>No quotes yet. <Link href="/quotes/new">Send your first quote</Link>.</>}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Campaigns() {
  const { business } = useSession();
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.swr<Campaign[]>("/campaigns", setRows).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBox error={error} />;
  if (!rows) return <Loading />;
  if (!rows.length) return (
    <div className="panel empty" style={{ padding: 40 }}>
      <p style={{ margin: "0 0 14px" }}>No campaigns yet. Make an offer like “Bridal package AED 1,500 until 30 Nov”, then put its link and QR code in your posts and ads.</p>
      <Link className="btn primary" href="/quotes/campaigns/new">Create a campaign</Link>
    </div>
  );
  return (
    <div className="camps">
      {rows.map((c) => (
        <article className="camp" key={c.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="camp-pic" src={`/api/public/c/${c.token}/image/portrait.jpg?v=${c.image_version}`} alt="" loading="lazy" />
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
            <button className="btn sm" onClick={() => copyText(c.public_url)}>Copy link</button>
            <Link className="btn sm" href={`/quotes/campaigns/${c.id}`}>Open</Link>
            {c.active && !c.expired && <Link className="btn sm primary" href={`/quotes/campaigns/${c.id}#post`}>Post to social</Link>}
          </div>
        </article>
      ))}
    </div>
  );
}
