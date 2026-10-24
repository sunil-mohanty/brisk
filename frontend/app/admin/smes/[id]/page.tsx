"use client";

import Link from "next/link";
import { site } from "@/lib/site";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ActivityGrid, ago, eventLabel, HealthPill, PayPill } from "@/components/admin";
import { copyText, ErrorBox, Loading, PageHead, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, money, todayISO, waLink } from "@/lib/format";
import type { AdminSmeDetail } from "@/lib/types";

export default function SmeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<AdminSmeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.get<AdminSmeDetail>(`/admin/smes/${id}`).then(setD).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (error && !d) return <ErrorBox error={error} />;
  if (!d) return <Loading />;

  const patch = async (body: Record<string, unknown>, msg: string) => {
    try {
      setD(await api.patch<AdminSmeDetail>(`/admin/smes/${id}`, body));
      toast(msg);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  async function resetLink() {
    try {
      const r = await api.post<{ link: string; email: string; expires_minutes: number }>(`/admin/smes/${id}/reset-link`);
      await copyText(r.link);
      toast(`Reset link for ${r.email} copied. It works once, for ${r.expires_minutes} minutes.`);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <>
      <PageHead
        eyebrow={<><Link href="/admin/smes">Businesses</Link> / {d.name}</>}
        title={d.name}
        sub={`${d.owner_name ?? ""} · ${d.owner_email ?? ""}${d.phone ? ` · ${d.phone}` : ""}${d.came_from ? ` · came from ${d.came_from}` : ""}`}
        action={
          <div className="acts">
            {d.phone && <a className="btn wa" href={waLink(d.phone, `Hi ${d.owner_name?.split(" ")[0] ?? ""}, this is ${site.name}.`)} target="_blank" rel="noreferrer">WhatsApp owner</a>}
            <button className="btn" onClick={resetLink}>Copy password reset link</button>
          </div>
        }
      />

      <div className="kpis">
        <div className="kpi"><span>With you for</span><strong>{d.days_since_signup}</strong><em>days · since {fmtDate(d.signed_up)}</em></div>
        <div className="kpi"><span>Days used</span><strong>{d.days_used}</strong><em>{d.days_used_30} in the last 30 days</em></div>
        <div className="kpi"><span>Last used</span><strong className="money">{ago(d.last_active)}</strong><em><HealthPill h={d.health} /></em></div>
        <div className="kpi"><span>Payment</span><strong className="money">{d.plan_amount ? `${money(d.plan_amount)}/mo` : "—"}</strong><em><PayPill p={d.payment_state} /> {d.paid_until ? `until ${fmtDate(d.paid_until)}` : d.trial_ends_at ? `trial to ${fmtDate(d.trial_ends_at)}` : ""}</em></div>
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Days used <span className="muted small">{d.days_since_signup > 119 ? "last 17 weeks" : "since sign-up"}</span></h2>
        <ActivityGrid days={Math.min(119, d.days_since_signup)} active={d.active_days} start={d.signed_up} />
      </section>

      <div className="detail">
        <div className="stack">
          <section className="panel">
            <h2>What they've done</h2>
            <div className="usage">
              <div><b className="mono">{d.customers}</b><span>customers</span></div>
              <div><b className="mono">{d.leads}</b><span>leads</span></div>
              <div><b className="mono">{d.qr_codes}</b><span>QR codes · {d.scans} scans</span></div>
              <div><b className="mono">{d.quotes}</b><span>quotes · {d.quotes_30} in 30 days</span></div>
              <div><b className="mono">{d.services}</b><span>service records</span></div>
            </div>
            <ol className="steps">
              {d.steps.map((s) => (
                <li key={s.key} className={s.done ? "done" : ""}>
                  <i aria-hidden="true">{s.done ? "✓" : ""}</i>
                  <span>{s.label}</span>
                  <time>{s.date ? fmtDate(s.date) : s.done ? "Done" : "Not yet"}</time>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel">
            <h2>Recent activity</h2>
            {d.events.length ? (
              <ul className="timeline">
                {d.events.map((e, i) => (
                  <li key={i} className={e.kind === "login" ? "view" : ""}><i /><span>{eventLabel(e.kind)}{e.detail ? <span className="muted"> · {e.detail}</span> : null}</span><time>{fmtDateTime(e.at)}</time></li>
                ))}
              </ul>
            ) : <p className="muted" style={{ margin: 0 }}>Nothing recorded yet. Sign-ins, quotes, imports and payments will show here.</p>}
          </section>
        </div>

        <div className="stack">
          <Billing d={d} onSaved={setD} patch={patch} />
          <section className="panel">
            <h2>Features</h2>
            <label className="check" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" checked={d.link_page_enabled} onChange={(e) => patch({ link_page_enabled: e.target.checked }, e.target.checked ? "Link page switched on" : "Link page switched off")} />
              <span>
                <b>Link page</b> (link-in-bio for Instagram & TikTok)
                <span className="hint" style={{ display: "block" }}>
                  {d.link_page_enabled ? <>On. Live at <a href={`/${d.slug}`} target="_blank" rel="noreferrer">/{d.slug}</a> and shown in their menu.</> : "Off. Hidden from their menu, and the public page shows “not found”."}
                </span>
              </span>
            </label>
          </section>
          <section className="panel">
            <h2>Account</h2>
            {d.status === "suspended" ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>Paused. The owner can't sign in. Their clients' quote and visit links still work.</p>
                <button className="btn primary" onClick={() => patch({ status: "active" }, "Account switched back on")}>Switch account back on</button>
              </>
            ) : (
              <>
                <p className="muted" style={{ marginTop: 0 }}>Pausing stops the owner signing in, for example when they haven't paid. Their clients' links keep working. You can switch it back on any time.</p>
                <PauseButton onConfirm={() => patch({ status: "suspended" }, "Account paused")} />
              </>
            )}
          </section>
          <Notes d={d} patch={patch} />
        </div>
      </div>
    </>
  );
}

function PauseButton({ onConfirm }: { onConfirm: () => void }) {
  const [ask, setAsk] = useState(false);
  return ask ? (
    <div className="acts" style={{ justifyContent: "flex-start" }}>
      <button className="btn danger" onClick={onConfirm}>Yes, pause account</button>
      <button className="btn" onClick={() => setAsk(false)}>Cancel</button>
    </div>
  ) : <button className="btn danger" onClick={() => setAsk(true)}>Pause account</button>;
}

function Notes({ d, patch }: { d: AdminSmeDetail; patch: (b: Record<string, unknown>, m: string) => void }) {
  const [note, setNote] = useState(d.admin_note ?? "");
  return (
    <section className="panel">
      <h2>Your notes <span className="muted small">only you see these</span></h2>
      <textarea id="admin-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Deal terms, who referred them, what they asked for…" />
      <div className="foot" style={{ marginTop: 8 }}>
        <button className="btn sm" disabled={note === (d.admin_note ?? "")} onClick={() => patch({ admin_note: note || null }, "Notes saved")}>Save notes</button>
      </div>
    </section>
  );
}

function Billing({ d, onSaved, patch }: { d: AdminSmeDetail; onSaved: (x: AdminSmeDetail) => void; patch: (b: Record<string, unknown>, m: string) => void }) {
  const [plan, setPlan] = useState({ plan: d.plan ?? "", plan_amount: d.plan_amount ? String(Number(d.plan_amount)) : "", trial_ends_at: d.trial_ends_at ?? "", paid_until: d.paid_until ?? "" });
  const [pay, setPay] = useState({ amount: d.plan_amount ? String(Number(d.plan_amount)) : "", months: "1", paid_on: todayISO(), method: "Bank transfer", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [delId, setDelId] = useState<number | null>(null);

  async function record() {
    setError(null);
    try {
      onSaved(await api.post<AdminSmeDetail>(`/admin/smes/${d.id}/payments`, { amount: Number(pay.amount), months: Number(pay.months), paid_on: pay.paid_on, method: pay.method || null, note: pay.note || null }));
      toast("Payment recorded");
      setPay({ ...pay, note: "" });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove(pid: number) {
    try {
      onSaved(await api.del(`/admin/smes/${d.id}/payments/${pid}`) as unknown as AdminSmeDetail);
      toast("Payment removed");
    } catch (e) {
      setError((e as Error).message);
    }
    setDelId(null);
  }

  return (
    <section className="panel">
      <h2>Plan &amp; payments</h2>
      <ErrorBox error={error} />
      <div className="form">
        <label>Plan<input id="plan" value={plan.plan} onChange={(e) => setPlan({ ...plan, plan: e.target.value })} placeholder="Starter" /></label>
        <label>Monthly price (AED)<input id="plan-amount" type="number" min="0" step="1" value={plan.plan_amount} onChange={(e) => setPlan({ ...plan, plan_amount: e.target.value })} /></label>
        <label>Trial ends<input id="trial-ends" type="date" value={plan.trial_ends_at} onChange={(e) => setPlan({ ...plan, trial_ends_at: e.target.value })} /></label>
        <label>Paid until<input id="paid-until" type="date" value={plan.paid_until} onChange={(e) => setPlan({ ...plan, paid_until: e.target.value })} /></label>
      </div>
      <div className="foot" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => patch({ plan: plan.plan || null, plan_amount: plan.plan_amount === "" ? null : Number(plan.plan_amount), trial_ends_at: plan.trial_ends_at || null, paid_until: plan.paid_until || null }, "Plan saved")}>Save plan</button>
      </div>

      <h3 className="subhead">Record a payment</h3>
      <div className="form">
        <label>Amount (AED)<input id="pay-amount" type="number" min="1" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></label>
        <label>
          Covers
          <select id="pay-months" value={pay.months} onChange={(e) => setPay({ ...pay, months: e.target.value })}>
            {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>)}
          </select>
        </label>
        <label>Paid on<input id="pay-date" type="date" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} /></label>
        <label>
          Method
          <select id="pay-method" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
            {["Bank transfer", "Cash", "Card link", "Cheque", "Other"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="full">Note<input id="pay-note" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder="Reference number, receipt…" /></label>
      </div>
      <p className="muted small">"Paid until" moves forward by the months covered, starting from whichever is latest: the current paid-until date, the trial end, or the day they paid.</p>
      <div className="foot" style={{ marginTop: 0 }}>
        <button className="btn primary" disabled={!Number(pay.amount)} onClick={record}>Record payment</button>
      </div>

      {d.payments.length > 0 && (
        <div className="list" style={{ marginTop: 12 }}>
          {d.payments.map((p) => (
            <div className="row" key={p.id}>
              <div className="l">
                <b>{money(p.amount)}</b> · {fmtDate(p.paid_on)}
                <div>{p.method ?? ""} · covers until {fmtDate(p.covers_until)}{p.note ? ` · ${p.note}` : ""}</div>
              </div>
              {delId === p.id ? (
                <div className="acts"><button className="btn sm danger" onClick={() => remove(p.id)}>Remove</button><button className="btn sm" onClick={() => setDelId(null)}>Keep</button></div>
              ) : <button className="btn sm" onClick={() => setDelId(p.id)}>Undo</button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
