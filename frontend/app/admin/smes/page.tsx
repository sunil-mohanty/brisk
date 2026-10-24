"use client";

import Link from "next/link";
import { site } from "@/lib/site";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ago, HealthPill, PayPill } from "@/components/admin";
import { ErrorBox, Loading, PageHead } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, money } from "@/lib/format";
import type { AdminSme } from "@/lib/types";
import { VOCAB } from "@/lib/vocab";

const FILTERS: [string, string, (r: AdminSme) => boolean][] = [
  ["all", "All", () => true],
  ["active", "Active", (r) => r.health === "active"],
  ["attention", "Slipping or not started", (r) => ["slipping", "dormant", "never_started"].includes(r.health)],
  ["trial", "On trial", (r) => r.payment_state === "trial"],
  ["paid", "Paid", (r) => r.payment_state === "paid"],
  ["unpaid", "Not paid", (r) => r.payment_state === "overdue" || r.payment_state === "trial_ended"],
  ["paused", "Paused", (r) => r.status === "suspended"],
];

export default function SmesPage() {
  return <Suspense fallback={<Loading />}><Smes /></Suspense>;
}

function Smes() {
  const params = useSearchParams();
  const router = useRouter();
  const [rows, setRows] = useState<AdminSme[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const f = params.get("f") ?? "all";
  useEffect(() => { api.swr<AdminSme[]>("/admin/smes", setRows).catch((e) => setError(e.message)); }, []);

  const shown = useMemo(() => {
    const test = FILTERS.find(([k]) => k === f)?.[2] ?? (() => true);
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(test).filter((r) => !needle || [r.name, r.owner_name, r.owner_email, r.phone, r.invite_label, r.came_from].some((v) => v?.toLowerCase().includes(needle)));
  }, [rows, f, q]);

  return (
    <>
      <PageHead
        eyebrow={`${site.name} admin`}
        title="Businesses"
        sub={`Every business on ${site.name}: how long they've been with you, how many days they actually used it, and whether they've paid.`}
        action={<input id="sme-search" className="headsearch" type="search" placeholder="Search name, owner, phone" value={q} onChange={(e) => setQ(e.target.value)} />}
      />
      <ErrorBox error={error} />
      <div className="filters">
        {FILTERS.map(([k, label, test]) => (
          <button key={k} className="chip" aria-pressed={f === k} onClick={() => router.replace(k === "all" ? "/admin/smes" : `/admin/smes?f=${k}`)}>
            {label} <span className="mono">{(rows ?? []).filter(test).length}</span>
          </button>
        ))}
      </div>
      {!rows ? <Loading /> : (
        <div className="tablewrap">
          <table className="ctable">
            <thead>
              <tr>
                <th>Business</th><th>With you since</th><th title="Days on which they used the app">Days used</th><th>Last used</th>
                <th className="num">Customers</th><th className="num" title="Quotes created in the last 30 days">Quotes (30d)</th><th>Usage</th><th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="rowlink-tr" onClick={() => router.push(`/admin/smes/${r.id}`)}>
                  <td className="c-main">
                    <Link className="rowlink" href={`/admin/smes/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.name}</Link>
                    <div className="sub">{r.owner_name} · {r.owner_email}</div>
                    <div className="sub">{VOCAB[r.business_type as keyof typeof VOCAB]?.label ?? "Other"} · came from {r.came_from ?? "direct / unknown"}</div>
                  </td>
                  <td className="c-stat c-since" data-label="With you">{fmtDate(r.signed_up)}<div className="sub">{r.days_since_signup} day{r.days_since_signup === 1 ? "" : "s"}</div></td>
                  <td className="c-line">
                    <b className="mono">{r.days_used}</b> <span className="sub">of {r.days_since_signup} days used</span>
                    <div className="usebar" title={`${r.days_used} of ${r.days_since_signup} days`}><div style={{ width: `${Math.min(100, (r.days_used / r.days_since_signup) * 100)}%` }} /></div>
                  </td>
                  <td className="sub c-stat" data-label="Last used">{ago(r.last_active)}</td>
                  <td className="num c-stat" data-label="Customers">{r.customers}</td>
                  <td className="num c-stat" data-label="Quotes 30d">{r.quotes_30}</td>
                  <td className="c-stat c-first"><HealthPill h={r.health} /></td>
                  <td className="c-end">
                    <PayPill p={r.payment_state} />
                    <div className="sub">
                      {r.payment_state === "paid" && r.paid_until ? `until ${fmtDate(r.paid_until)}` : r.trial_ends_at && r.payment_state.startsWith("trial") ? `trial to ${fmtDate(r.trial_ends_at)}` : ""}
                      {r.plan_amount ? ` · ${money(r.plan_amount)}/mo` : ""}
                    </div>
                  </td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={8} className="empty">{rows.length ? "No businesses match." : <>No businesses yet. <Link href="/admin/invites">Create an invite code</Link> for your first one.</>}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
