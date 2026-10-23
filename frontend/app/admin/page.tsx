"use client";

import Link from "next/link";
import { site } from "@/lib/site";
import { useEffect, useState } from "react";
import { ErrorBox, Loading, PageHead, Pill } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, money } from "@/lib/format";
import type { AdminOverview } from "@/lib/types";

const ATTN: Record<string, { pill: string; label: string }> = {
  overdue: { pill: "due", label: "Overdue" },
  trial_ended: { pill: "due", label: "Trial ended" },
  trial_ending: { pill: "soon", label: "Trial ending" },
  never_started: { pill: "due", label: "Never started" },
  slipping: { pill: "soon", label: "Slipping" },
  dormant: { pill: "due", label: "Dormant" },
};

export default function AdminOverviewPage() {
  const [d, setD] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.swr<AdminOverview>("/admin/overview", setD).catch((e) => setError(e.message)); }, []);

  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  const signups = d.funnel[0]?.count || 1;
  const maxWeek = Math.max(1, ...d.weeks.map((w) => w.active));

  return (
    <>
      <PageHead eyebrow={`${site.name} admin`} title="Overview" sub={`How many salons you have, who is using ${site.name}, and who needs a call.`} />
      <div className="kpis">
        <Link href="/admin/smes" className="kpi kpilink"><span>SMEs</span><strong>{d.smes}</strong><em>{d.active_7d} used it in the last 7 days</em></Link>
        <Link href="/admin/smes?f=paid" className="kpi kpilink"><span>Paying</span><strong>{d.paying}</strong><em>{d.trial} on trial · {d.trials_ending_7d} ending this week</em></Link>
        <div className="kpi"><span>Monthly revenue</span><strong className="money">{money(d.mrr)}</strong><em>From SMEs paid up to date</em></div>
        <Link href="/admin/smes?f=unpaid" className="kpi kpilink"><span>Waiting for payment</span><strong>{d.overdue}</strong><em>Overdue or trial ended{d.suspended ? ` · ${d.suspended} paused` : ""}</em></Link>
      </div>

      <div className="grid2">
        <section className="panel">
          <h2>Needs your attention <Link href="/admin/smes">All SMEs →</Link></h2>
          <div className="list">
            {d.attention.length ? d.attention.map((a, i) => (
              <Link className="row" key={i} href={`/admin/smes/${a.id}`}>
                <div className="l"><b>{a.name}</b><div>{a.text}</div></div>
                <Pill status={ATTN[a.kind]?.pill ?? "neutral"} label={ATTN[a.kind]?.label ?? a.kind} />
              </Link>
            )) : <div className="empty">Nothing needs you right now.</div>}
          </div>
        </section>

        <section className="panel">
          <h2>Getting started <span className="muted small">how far SMEs get</span></h2>
          <div className="funnel">
            {d.funnel.map((f) => (
              <div className="frow" key={f.key} title={`${f.count} of ${d.funnel[0].count} SMEs`}>
                <span className="flabel">{f.label}</span>
                <div className="track"><div className="fill" style={{ width: `${(f.count / signups) * 100}%` }} /></div>
                <b className="mono">{f.count}</b>
                <span className="fpct mono">{Math.round((f.count / signups) * 100)}%</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Where SMEs come from <span className="muted small">from ad links (utm_source) and referring sites</span></h2>
        <div className="tablewrap">
          <table className="compact">
            <thead><tr><th>Source</th><th className="num">Signed up</th><th className="num">Using it this week</th><th className="num">Paying</th></tr></thead>
            <tbody>
              {(d.sources ?? []).map((s) => (
                <tr key={s.source}><td>{s.source}</td><td className="num">{s.smes}</td><td className="num">{s.active}</td><td className="num">{s.paying}</td></tr>
              ))}
              {!d.sources?.length && <tr><td colSpan={4} className="empty">No sign-ups yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Salons using {site.name} each week <span className="muted small">last 8 weeks</span></h2>
        <div className="wbars" role="img" aria-label="Active SMEs per week">
          {d.weeks.map((w, i) => (
            <div className="wcol" key={w.start} title={`Week of ${fmtDate(w.start)}: ${w.active} active SMEs, ${w.quotes} quotes, ${w.signups} sign-ups`}>
              <div className="wval mono">{i === d.weeks.length - 1 || w.active === maxWeek ? w.active : ""}</div>
              <div className="wbar"><div style={{ height: `${(w.active / maxWeek) * 100}%` }} /></div>
              <div className="wlab">{new Date(w.start + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
            </div>
          ))}
        </div>
        <div className="tablewrap" style={{ marginTop: 12 }}>
          <table className="compact">
            <thead><tr><th>Week of</th><th className="num">Active SMEs</th><th className="num">Quotes created</th><th className="num">New sign-ups</th></tr></thead>
            <tbody>
              {[...d.weeks].reverse().map((w) => (
                <tr key={w.start}><td>{fmtDate(w.start)}</td><td className="num">{w.active}</td><td className="num">{w.quotes}</td><td className="num">{w.signups}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
