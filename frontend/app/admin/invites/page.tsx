"use client";

import Link from "next/link";
import { site } from "@/lib/site";
import { useCallback, useEffect, useState } from "react";
import { copyText, ErrorBox, Loading, PageHead, Pill, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, money } from "@/lib/format";
import type { AdminInvite } from "@/lib/types";

export default function InvitesPage() {
  const [rows, setRows] = useState<AdminInvite[] | null>(null);
  const [f, setF] = useState({ label: "", trial_days: "14", plan: "Starter", plan_amount: "", note: "" });
  const [made, setMade] = useState<AdminInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get<AdminInvite[]>("/admin/invites").then(setRows).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const inv = await api.post<AdminInvite>("/admin/invites", {
        label: f.label, trial_days: Number(f.trial_days) || 0, plan: f.plan || null,
        plan_amount: f.plan_amount === "" ? null : Number(f.plan_amount), note: f.note || null,
      });
      setMade(inv);
      setF({ ...f, label: "", note: "" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  const message = (i: AdminInvite) =>
    `Welcome to ${site.name}! Create your account here: ${i.signup_link}\nYour invite code: ${i.code}${i.trial_days ? `\nYour free trial runs for ${i.trial_days} days.` : ""}`;

  return (
    <>
      <PageHead eyebrow={`${site.name} admin`} title="Invite codes" sub="Make one code per salon. It works once, sets their trial and plan, and shows you which deal each sign-up came from." />
      <div className="detail">
        <form className="card" onSubmit={create}>
          <h2 className="cardtitle">New invite code</h2>
          <ErrorBox error={error} />
          <div className="form" style={{ marginTop: 8 }}>
            <label className="full">For which SME<input id="inv-label" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Shreeu's Cafe, Karama" /></label>
            <label>Free trial (days)<input id="inv-trial" type="number" min="0" max="365" value={f.trial_days} onChange={(e) => setF({ ...f, trial_days: e.target.value })} /></label>
            <label>Plan<input id="inv-plan" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} /></label>
            <label>Monthly price (AED)<input id="inv-amount" type="number" min="0" step="1" value={f.plan_amount} onChange={(e) => setF({ ...f, plan_amount: e.target.value })} placeholder="49" /></label>
            <label className="full">Note<input id="inv-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Met at…, agreed discount…" /></label>
          </div>
          <div className="foot"><button className="btn primary" disabled={busy || !f.label.trim()}>{busy ? "Creating…" : "Create invite code"}</button></div>
        </form>

        {made && (
          <section className="panel invite-made">
            <h2>Code for {made.label}</h2>
            <div className="bigcode mono">{made.code}</div>
            <div className="linkbox"><input readOnly value={made.signup_link} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => copyText(made.signup_link)}>Copy link</button></div>
            <p className="muted small">The link fills in the code for them. Send it on WhatsApp:</p>
            <pre className="msg">{message(made)}</pre>
            <div className="acts" style={{ justifyContent: "flex-start" }}>
              <a className="btn wa" href={`https://wa.me/?text=${encodeURIComponent(message(made))}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
              <button className="btn" onClick={() => copyText(message(made)).then(() => toast("Message copied"))}>Copy message</button>
            </div>
          </section>
        )}
      </div>

      <h2 className="sectiontitle">All codes</h2>
      {!rows ? <Loading /> : (
        <div className="tablewrap">
          <table className="ctable">
            <thead><tr><th>Code</th><th>For</th><th>Trial &amp; plan</th><th>Status</th><th>Created</th><th /></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td className="mono c-main c-code">{i.code}</td>
                  <td className="c-line c-for">{i.label}{i.note && <div className="sub">{i.note}</div>}</td>
                  <td className="sub c-line">{i.trial_days} days{i.plan ? ` · ${i.plan}` : ""}{i.plan_amount ? ` · ${money(i.plan_amount)}/mo` : ""}</td>
                  <td className="c-end">
                    {i.used_at ? <><Pill status="won" label="Used" /><div className="sub">by <Link href={`/admin/smes/${i.used_by_business_id}`}>{i.used_by_name ?? "a business"}</Link> · {fmtDate(i.used_at)}</div></>
                      : i.revoked ? <Pill status="neutral" label="Switched off" /> : <Pill status="new" label="Not used yet" />}
                  </td>
                  <td className="sub c-hide">{fmtDate(i.created_at)}</td>
                  <td className="c-acts">
                    {!i.used_at && !i.revoked && (
                      <div className="acts">
                        <button className="btn sm" onClick={() => copyText(i.signup_link)}>Copy link</button>
                        <button className="btn sm danger" onClick={async () => { await api.post(`/admin/invites/${i.id}/revoke`); load(); toast("Code switched off"); }}>Switch off</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="empty">No invite codes yet. Create one above for your first SME.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
