"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Avatar, DAYS, KIND, LeaveForm, STATUS, dateRange } from "@/components/StaffBits";
import { ErrorBox, Loading, PageHead, Pill, toast } from "@/components/ui";
import { api, auth } from "@/lib/api";
import { fmtDayLong, fmtTime, money, todayUAE } from "@/lib/format";
import type { AuthResponse, MyDay, StaffToday } from "@/lib/types";
import { duration } from "@/lib/vocab";
import { words } from "@/lib/words";

const STATUS_PILL: Record<string, string> = { booked: "new", confirmed: "quoted", arrived: "accepted", completed: "won", no_show: "lost", cancelled: "lost" };
const STATUS_LABEL: Record<string, string> = { booked: "Booked", confirmed: "Confirmed", arrived: "In the chair", completed: "Done", no_show: "No-show", cancelled: "Cancelled" };

export default function MyDayPage() {
  const { user, business } = useSession();
  const W = words(business.business_type);
  const [d, setD] = useState<MyDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get<MyDay>("/staff/me").then(setD).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function clock(action: "in" | "out") {
    setBusy(true);
    try {
      const t = await api.post<StaffToday>("/staff/me/clock", { action });
      setD((x) => x && { ...x, today: t });
      toast(action === "in" ? `Clocked in at ${fmtTime(t.clock_in!)}` : `Clocked out at ${fmtTime(t.clock_out!)}. See you tomorrow!`);
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  async function ask(b: Parameters<React.ComponentProps<typeof LeaveForm>["onSubmit"]>[0]) {
    setBusy(true);
    try { await api.post("/staff/me/leave", b); toast("Request sent to the owner"); setAsking(false); load(); } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  async function cancel(id: number) {
    await api.del(`/staff/me/leave/${id}`);
    load();
  }

  if (error) {
    return <>
      <PageHead title="My day" />
      <ErrorBox error={user.role === "staff" ? error : "Your login isn't linked to a staff profile. Owners manage the team from Staff."} />
      {user.role !== "staff" && <Link className="btn" href="/team">Go to Staff</Link>}
    </>;
  }
  if (!d) return <Loading />;
  const t = d.today;
  const first = d.staff.name.split(" ")[0];
  const clockedIn = !!t.clock_in && !t.clock_out;
  const earn = d.earnings?.rows[0];

  return (
    <>
      <PageHead eyebrow={fmtDayLong(todayUAE())} title={`Hi ${first}`} sub={`${business.name} · ${d.staff.role || W.staffOne}`} />
      <div className="myday">
        <section className={`panel clockcard s-${t.status}`}>
          <div className="clock-top">
            <Avatar name={d.staff.name} color={d.staff.color} size={48} />
            <div>
              <b className="clock-st">{STATUS[t.status].label}</b>
              <span className="muted">{t.hours ? `Today ${t.hours[0]}–${t.hours[1]}` : "Not working today"}</span>
            </div>
          </div>
          {t.clock_in && <p className="clock-times">In {fmtTime(t.clock_in)}{t.clock_out ? ` · Out ${fmtTime(t.clock_out)}` : ""}</p>}
          {t.status !== "leave" && !t.clock_out && (
            <button type="button" className={`btn clockbtn ${clockedIn ? "" : "primary"}`} disabled={busy} onClick={() => clock(clockedIn ? "out" : "in")}>
              {clockedIn ? "Clock out" : "Clock in"}
            </button>
          )}
          {t.clock_out && <p className="small muted" style={{ margin: 0 }}>Done for today. If a time is wrong, ask the owner to correct it.</p>}
        </section>

        <section className="panel">
          <h2>Today&apos;s {W.appointments} <span className="muted small">{d.appointments.length}</span></h2>
          {d.appointments.length === 0 ? <div className="empty">Nothing booked for you today.</div> : (
            <div className="list">
              {d.appointments.map((a) => (
                <Link className="row" key={a.id} href={`/appointments?view=day&day=${todayUAE()}&id=${a.id}`}>
                  <div className="l"><b>{fmtTime(a.starts_at)} · {a.customer.name}</b><div>{a.service} · {duration(a.duration_min)}{a.notes ? ` · ${a.notes.slice(0, 60)}` : ""}</div></div>
                  <Pill status={STATUS_PILL[a.status]} label={STATUS_LABEL[a.status]} />
                </Link>
              ))}
            </div>
          )}
          <Link className="btn sm" href="/appointments" style={{ marginTop: 10 }}>Open my diary</Link>
        </section>

        {d.earnings && earn && (
          <section className="panel">
            <h2>My commission <span className="muted small">this month so far</span></h2>
            <div className="earn">
              <strong>{money(earn.commission, business.currency)}</strong>
              <span className="muted">{earn.services} services · {money(earn.net_sales, business.currency)} before VAT</span>
            </div>
            {earn.lines.map((ln) => (
              <div className="pline" key={ln.category}><span>{ln.category} <span className="muted">at {Number(ln.rate)}%</span></span><span className="mono">{money(ln.commission, business.currency)}</span></div>
            ))}
          </section>
        )}

        <section className="panel">
          <div className="att-head">
            <h2>My leave</h2>
            {!asking && <button type="button" className="btn sm primary" onClick={() => setAsking(true)}>Ask for leave</button>}
          </div>
          {asking && <LeaveForm busy={busy} onSubmit={ask} onCancel={() => setAsking(false)} />}
          {d.leave.length === 0 ? !asking && <div className="empty">No leave yet.</div> : d.leave.map((lv) => (
            <div key={lv.id} className={`leave-row s-${lv.status}`}>
              <div className="lr-main">
                <b>{KIND[lv.kind]}</b> <span className="muted">· {lv.days} day{lv.days === 1 ? "" : "s"}</span>
                <div>{dateRange(lv.start_date, lv.end_date)}{lv.reason ? ` · “${lv.reason}”` : ""}</div>
                {lv.reply && <div className="small muted">Owner: {lv.reply}</div>}
              </div>
              <span className={`st-chip t-${lv.status === "approved" ? "ok" : lv.status === "rejected" ? "bad" : lv.status === "pending" ? "warn" : "muted"}`}>
                {lv.status === "pending" ? "Waiting" : lv.status === "approved" ? "Approved" : lv.status === "rejected" ? "Declined" : "Cancelled"}
              </span>
              {lv.status === "pending" && <button type="button" className="btn sm ghost" onClick={() => cancel(lv.id)}>Cancel</button>}
            </div>
          ))}
        </section>

        <section className="panel">
          <h2>My week</h2>
          <div className="weekhours">
            {DAYS.map((name, i) => {
              const span = d.week[String(i)];
              return <div key={name} className={span ? "" : "off"}><b>{name}</b><span>{span ? `${span[0]}–${span[1]}` : "Off"}</span></div>;
            })}
          </div>
        </section>

        <ChangePassword />
      </div>
    </>
  );
}

function ChangePassword() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post<AuthResponse>("/me/password", { current_password: cur, new_password: next });
      auth.set(r.token);
      setCur(""); setNext("");
      toast("Password changed");
    } catch (err) { toast((err as Error).message); }
    setBusy(false);
  }
  return (
    <section className="panel" id="account">
      <h2>My login</h2>
      <form className="form" onSubmit={save}>
        <label>Current password<input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label>New password <span className="hint">(8+ characters)</span><input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <div className="full"><button className="btn" disabled={busy || !cur || next.length < 8}>{busy ? "Saving…" : "Change password"}</button></div>
      </form>
    </section>
  );
}
