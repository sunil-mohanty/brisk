"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useSession } from "@/components/session";
import { Avatar, KIND, LeaveForm, PeriodPicker, STATUS, StatusChip, dateRange, hours, thisMonth } from "@/components/StaffBits";
import { Tip } from "@/components/Tips";
import { ErrorBox, Loading, PageHead, toast } from "@/components/ui";
import { api, download } from "@/lib/api";
import { addDays, fmtDay, fmtTime, money, todayUAE, uaeTime } from "@/lib/format";
import type { AttendanceDay, AttendanceRow, Commission, Leave, Performance, StaffList } from "@/lib/types";
import { vocab } from "@/lib/vocab";
import { words } from "@/lib/words";

type Tab = "team" | "attendance" | "leave" | "commission" | "performance";
const TABS: [Tab, string][] = [["team", "Team"], ["attendance", "Attendance"], ["leave", "Leave"], ["commission", "Commission"], ["performance", "Performance"]];

export default function StaffPage() {
  return <Suspense fallback={<Loading />}><StaffHome /></Suspense>;
}

function StaffHome() {
  const { business } = useSession();
  const W = words(business.business_type);
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((TABS.find(([t]) => t === params.get("tab"))?.[0]) ?? "team");
  const [list, setList] = useState<StaffList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.get<StaffList>("/staff").then(setList).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const go = (t: Tab) => { setTab(t); router.replace(`/team?tab=${t}`, { scroll: false }); };
  const active = list?.staff.filter((s) => s.active) ?? [];

  return (
    <>
      <PageHead eyebrow={list ? `${active.length} on the team` : undefined} title={W.Staff}
        sub="Profiles, skills and hours, who's in today, leave, commission and how everyone is doing." />
      <ErrorBox error={error} />
      <div className="stafftabs" role="tablist" aria-label="Staff">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => go(t)}>
            {label}{t === "leave" && list?.pending_leave ? <span className="badge">{list.pending_leave}</span> : null}
          </button>
        ))}
      </div>
      {!list ? <Loading /> : tab === "team" ? <TeamTab list={list} reload={load} />
        : tab === "attendance" ? <AttendanceTab />
        : tab === "leave" ? <LeaveTab people={active} onChange={load} />
        : tab === "commission" ? <CommissionTab />
        : <PerformanceTab />}
    </>
  );
}

// ---------------------------------------------------------------- team
function TeamTab({ list, reload }: { list: StaffList; reload: () => void }) {
  const { business } = useSession();
  const v = vocab(business.business_type);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [showGone, setShowGone] = useState(false);
  const active = list.staff.filter((s) => s.active);
  const gone = list.staff.filter((s) => !s.active);
  const inNow = active.filter((s) => s.today && ["working", "late"].includes(s.today.status)).length;
  const due = active.filter((s) => s.today && s.today.status !== "off" && s.today.status !== "leave").length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post("/staff", { name: name.trim(), role: role.trim() || null, phone: phone.trim() || null });
      toast(`${name.trim()} added. Open their profile to set skills, hours and commission.`);
      setName(""); setRole(""); setPhone("");
      reload();
    } catch (err) { toast((err as Error).message); }
  }
  async function restore(id: number) {
    await api.patch(`/staff/${id}`, { active: true });
    reload();
  }

  return (
    <>
      {active.length > 0 && (
        <div className="kpis">
          <div className="kpi"><span>In now</span><strong>{inNow}<small> / {due}</small></strong><em>clocked in of those working today</em></div>
          <div className="kpi"><span>On leave today</span><strong>{active.filter((s) => s.today?.status === "leave").length}</strong><em>{list.pending_leave ? `${list.pending_leave} request${list.pending_leave === 1 ? "" : "s"} waiting` : "no requests waiting"}</em></div>
          <div className="kpi"><span>Late today</span><strong>{active.filter((s) => s.today?.status === "late").length}</strong><em>more than 10 min after start</em></div>
          <div className="kpi"><span>With app login</span><strong>{active.filter((s) => s.login_email).length}</strong><em>see their day & clock in</em></div>
        </div>
      )}
      <form className="card" onSubmit={add} style={{ marginBottom: 16 }}>
        <div className="form" style={{ gridTemplateColumns: "1fr 1fr 1fr auto", alignItems: "end" }}>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder={v.staffPlaceholder} maxLength={120} /></label>
          <label>Job title <span className="hint">(optional)</span><input value={role} onChange={(e) => setRole(e.target.value)} placeholder={`Senior ${v.staff.toLowerCase()}`} maxLength={80} /></label>
          <label>Mobile <span className="hint">(optional)</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050 123 4567" inputMode="tel" maxLength={40} /></label>
          <Tip id="tm.add" order={1} text="Add everyone who takes clients, including yourself."><button className="btn primary" disabled={!name.trim()}>Add staff member</button></Tip>
        </div>
      </form>
      {active.length === 0 ? <div className="panel empty">No one added yet. Add yourself first, then your {v.staff.toLowerCase()}s.</div> : (
        <div className="stafflist">
          {active.map((m) => (
            <Link key={m.id} href={`/team/${m.id}`} className="staffcard">
              <Avatar name={m.name} color={m.color} size={46} />
              <span className="sc-main">
                <b>{m.name}</b>
                <span className="sc-role">{m.role || v.staff}{m.login_role === "manager" ? " · Manager" : ""}</span>
                <span className="sc-meta">
                  {m.today ? <StatusChip today={m.today} /> : null}
                  {m.today?.hours && <span className="small muted">{m.today.hours[0]}–{m.today.hours[1]}</span>}
                  {!!m.today?.appointments && <span className="small muted">{m.today.appointments} booked today</span>}
                </span>
              </span>
              <span className="sc-side">
                <span className="small muted">{m.skill_ids.length ? `${m.skill_ids.length} skills` : "All services"}</span>
                <span className="small muted">{Number(m.commission_rate) || Object.keys(m.commission_by_category).length ? `${Number(m.commission_rate)}% commission` : "No commission set"}</span>
                <span className={`small ${m.login_email ? "ok-t" : "muted"}`}>{m.login_email ? "Has app login" : "No login"}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {gone.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="linkbtn" onClick={() => setShowGone(!showGone)}>{showGone ? "Hide" : "Show"} past staff ({gone.length})</button>
          {showGone && (
            <div className="list" style={{ marginTop: 8 }}>
              {gone.map((m) => (
                <div className="row" key={m.id}>
                  <div className="l"><b>{m.name}</b><div>{m.role || v.staff} · left the team</div></div>
                  <button type="button" className="btn sm" onClick={() => restore(m.id)}>Bring back</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- attendance
function mondayOf(d: string) {
  const wd = (new Date(d + "T12:00:00+04:00").getUTCDay() + 6) % 7;
  return addDays(d, -wd);
}

function AttendanceTab() {
  const [start, setStart] = useState(() => mondayOf(todayUAE()));
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [edit, setEdit] = useState<{ sid: number; name: string; d: AttendanceDay } | null>(null);
  const end = addDays(start, 6);
  const load = useCallback(() => { setRows(null); api.get<AttendanceRow[]>(`/staff/attendance?start=${start}&end=${end}`).then(setRows).catch((e) => toast(e.message)); }, [start, end]);
  useEffect(() => { load(); }, [load]);
  const today = todayUAE();

  return (
    <section className="panel">
      <div className="att-head">
        <h2>Attendance <span className="muted small">{dateRange(start, end)}</span></h2>
        <div className="acts">
          <button type="button" className="btn sm" onClick={() => setStart(addDays(start, -7))}>← Previous week</button>
          {start !== mondayOf(today) && <button type="button" className="btn sm" onClick={() => setStart(mondayOf(today))}>This week</button>}
          <button type="button" className="btn sm" disabled={addDays(start, 7) > today} onClick={() => setStart(addDays(start, 7))}>Next week →</button>
        </div>
      </div>
      <p className="small muted" style={{ margin: "0 0 12px" }}>Staff clock in and out from their phone. Late = more than 10 minutes after their start time. Tap a day to correct it.</p>
      {!rows ? <Loading /> : rows.length === 0 ? <div className="empty">Add your team first.</div> : (
        <div className="tablewrap att-wrap">
          <table className="att">
            <thead>
              <tr><th>Staff</th>{rows[0].days.map((d) => <th key={d.day} className={d.day === today ? "is-today" : undefined}>{fmtDay(d.day)}</th>)}<th className="num">Worked</th><th className="num">Late</th><th className="num">Absent</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.stylist_id}>
                  <td className="att-who"><Avatar name={r.name} color={r.color} size={28} /><b>{r.name}</b></td>
                  {r.days.map((d) => {
                    const fixable = d.day <= today;
                    return (
                      <td key={d.day} className={d.day === today ? "is-today" : undefined}>
                        <button type="button" className={`att-cell t-${STATUS[d.status].tone}`} disabled={!fixable} onClick={() => setEdit({ sid: r.stylist_id, name: r.name, d })}
                          aria-label={`${r.name}, ${fmtDay(d.day)}: ${STATUS[d.status].label}`}>
                          <span className="att-st">{d.status === "upcoming" && d.day > today ? "Scheduled" : STATUS[d.status].label}{d.edited ? " ✎" : ""}</span>
                          {d.clock_in ? <span className="att-t">{uaeTime(d.clock_in)}–{d.clock_out ? uaeTime(d.clock_out) : "…"}</span>
                            : d.hours && d.status === "upcoming" ? <span className="att-t">{d.hours[0]}–{d.hours[1]}</span> : null}
                        </button>
                      </td>
                    );
                  })}
                  <td className="num mono">{hours(r.worked_minutes)}</td>
                  <td className={`num mono${r.late ? " warn-t" : ""}`}>{r.late}</td>
                  <td className={`num mono${r.absent ? " bad-t" : ""}`}>{r.absent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <FixDay {...edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </section>
  );
}

function FixDay({ sid, name, d, onClose, onSaved }: { sid: number; name: string; d: AttendanceDay; onClose: () => void; onSaved: () => void }) {
  const [cin, setCin] = useState(d.clock_in ? uaeTime(d.clock_in) : d.hours?.[0] ?? "");
  const [cout, setCout] = useState(d.clock_out ? uaeTime(d.clock_out) : "");
  const [absent, setAbsent] = useState(d.status === "absent" && !d.clock_in);
  const [note, setNote] = useState(d.note ?? "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api.put(`/staff/${sid}/attendance/${d.day}`, { clock_in: absent ? null : cin || null, clock_out: absent ? null : cout || null, absent, note: note.trim() || null });
      toast("Attendance updated");
      onSaved();
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  return (
    <Sheet open onClose={onClose}>
      <div>
        <h2>{name} · {fmtDay(d.day)}</h2>
        <p className="intro">{d.hours ? `Working hours ${d.hours[0]}–${d.hours[1]}.` : "A day off."} Correct the times or mark the day absent.</p>
        <div className="form">
          <label className="check full"><input type="checkbox" checked={absent} onChange={(e) => setAbsent(e.target.checked)} />Absent (didn&apos;t come in)</label>
          {!absent && <>
            <label>Clocked in<input type="time" value={cin} onChange={(e) => setCin(e.target.value)} /></label>
            <label>Clocked out<input type="time" value={cout} onChange={(e) => setCout(e.target.value)} /></label>
          </>}
          <label className="full">Note <span className="hint">(optional)</span><input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Forgot to clock out, doctor's visit…" /></label>
        </div>
        <div className="foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || (!absent && !cin)} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- leave
function LeaveTab({ people, onChange }: { people: { id: number; name: string }[]; onChange: () => void }) {
  const [rows, setRows] = useState<Leave[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Record<number, string>>({});
  const load = useCallback(() => api.get<Leave[]>("/staff/leave").then(setRows).catch((e) => toast(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function decide(lv: Leave, approve: boolean) {
    try {
      await api.post(`/staff/leave/${lv.id}/decide`, { approve, reply: reply[lv.id]?.trim() || null });
      toast(approve ? `${lv.name}'s leave approved` : `${lv.name}'s request declined`);
      load(); onChange();
    } catch (e) { toast((e as Error).message); }
  }
  async function add(b: Parameters<React.ComponentProps<typeof LeaveForm>["onSubmit"]>[0]) {
    setBusy(true);
    try { await api.post("/staff/leave", b); toast("Leave added"); setAdding(false); load(); onChange(); } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  const pending = rows?.filter((r) => r.status === "pending") ?? [];
  const today = todayUAE();
  const upcoming = rows?.filter((r) => r.status === "approved" && r.end_date >= today) ?? [];
  const past = rows?.filter((r) => !(r.status === "pending" || (r.status === "approved" && r.end_date >= today))) ?? [];

  const Item = ({ lv, actions }: { lv: Leave; actions?: boolean }) => (
    <div className={`leave-row s-${lv.status}`}>
      <Avatar name={lv.name} color={lv.color} size={34} />
      <div className="lr-main">
        <b>{lv.name}</b> <span className="muted">· {KIND[lv.kind]} · {lv.days} day{lv.days === 1 ? "" : "s"}</span>
        <div>{dateRange(lv.start_date, lv.end_date)}{lv.reason ? ` · “${lv.reason}”` : ""}</div>
        {lv.clashes > 0 && <div className="warn-t small">{lv.clashes} booking{lv.clashes === 1 ? "" : "s"} in the diary during this leave. <Link href={`/appointments?view=day&day=${lv.start_date}`}>Move them</Link></div>}
        {lv.reply && <div className="small muted">Reply: {lv.reply}</div>}
        {actions && (
          <div className="acts" style={{ justifyContent: "flex-start", marginTop: 8 }}>
            <input className="lr-reply" placeholder="Reply (optional)" value={reply[lv.id] ?? ""} maxLength={300} onChange={(e) => setReply({ ...reply, [lv.id]: e.target.value })} />
            <button type="button" className="btn sm primary" onClick={() => decide(lv, true)}>Approve</button>
            <button type="button" className="btn sm ghost danger" onClick={() => decide(lv, false)}>Decline</button>
          </div>
        )}
      </div>
      {!actions && <span className={`st-chip t-${lv.status === "approved" ? "info" : lv.status === "rejected" ? "bad" : "muted"}`}>{lv.status === "approved" ? "Approved" : lv.status === "rejected" ? "Declined" : "Cancelled"}</span>}
    </div>
  );

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="att-head">
          <h2>Waiting for you <span className="muted small">{pending.length}</span></h2>
          {!adding && <button type="button" className="btn sm" onClick={() => setAdding(true)}>+ Add leave for someone</button>}
        </div>
        {adding && <LeaveForm people={people} busy={busy} submitLabel="Add leave" onSubmit={add} onCancel={() => setAdding(false)} />}
        {!rows ? <Loading /> : pending.length === 0 ? <div className="empty">No requests waiting. Staff ask for leave from their phone.</div> : pending.map((lv) => <Item key={lv.id} lv={lv} actions />)}
      </section>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Coming up</h2>
        {upcoming.length === 0 ? <div className="empty">Nobody has leave coming up.</div> : upcoming.map((lv) => <Item key={lv.id} lv={lv} />)}
      </section>
      {past.length > 0 && (
        <section className="panel">
          <h2>History</h2>
          {past.map((lv) => <Item key={lv.id} lv={lv} />)}
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------- commission
function CommissionTab() {
  const { business } = useSession();
  const cur = business.currency;
  const [[start, end], setPeriod] = useState<[string, string]>(thisMonth);
  const [c, setC] = useState<Commission | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { setC(null); api.get<Commission>(`/staff/commission?start=${start}&end=${end}`).then(setC).catch((e) => toast(e.message)); }, [start, end]);
  return (
    <section className="panel">
      <div className="att-head">
        <h2>Commission <span className="muted small">{dateRange(start, end)}</span></h2>
        <button type="button" className="btn sm" onClick={() => download(`/staff/commission.csv?start=${start}&end=${end}`, `commission-${start}-to-${end}.csv`)}>Download for payroll (CSV)</button>
      </div>
      <PeriodPicker start={start} end={end} onChange={(a, b) => setPeriod([a, b])} />
      {!c ? <Loading /> : (
        <>
          <div className="kpis" style={{ marginTop: 14 }}>
            <div className="kpi"><span>Commission to pay</span><strong>{money(c.total_commission, cur)}</strong><em>for finished {words(business.business_type).appointments}</em></div>
            <div className="kpi"><span>Sales by the team</span><strong>{money(c.total_sales, cur)}</strong><em>paid by clients, with VAT</em></div>
            <div className="kpi"><span>Services done</span><strong>{c.rows.reduce((a, r) => a + r.services, 0)}</strong><em>finished in this period</em></div>
            <div className="kpi"><span>Not assigned</span><strong>{money(c.unassigned_sales, cur)}</strong><em>finished with nobody chosen</em></div>
          </div>
          <div className="tablewrap">
            <table className="ctable comtable">
              <thead><tr><th>Staff</th><th className="num">Services</th><th className="num">Sales</th><th className="num">Before VAT</th><th className="num">Commission</th></tr></thead>
              <tbody>
                {c.rows.map((r) => (
                  <Fragment key={r.stylist_id}>
                    <tr className={r.lines.length ? "clickable" : undefined} onClick={() => r.lines.length && setOpen(open === r.stylist_id ? null : r.stylist_id)}>
                      <td className="c-main"><span className="att-who"><Avatar name={r.name} color={r.color} size={28} /><b>{r.name}</b>{r.lines.length > 0 && <span className="small muted">{open === r.stylist_id ? "▾" : "▸"}</span>}</span></td>
                      <td className="num mono c-stat" data-label="Services">{r.services}</td>
                      <td className="num mono c-stat" data-label="Sales">{money(r.sales, cur)}</td>
                      <td className="num mono c-stat" data-label="Before VAT">{money(r.net_sales, cur)}</td>
                      <td className="num c-end"><b>{money(r.commission, cur)}</b></td>
                    </tr>
                    {open === r.stylist_id && r.lines.map((ln) => (
                      <tr key={`${r.stylist_id}-${ln.category}`} className="com-line">
                        <td className="c-main">{ln.category} <span className="muted">at {Number(ln.rate)}%</span></td>
                        <td className="c-stat" /><td className="c-stat" />
                        <td className="num mono c-stat" data-label="Before VAT">{money(ln.sales, cur)}</td>
                        <td className="num mono c-end">{money(ln.commission, cur)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ margin: "12px 0 0" }}>
            Worked out on finished {words(business.business_type).appointments}, on the price before VAT ({Number(c.vat_rate)}%), using each person&apos;s rate for the
            menu category (or their default rate). Set rates on each staff profile. Tap a name to see the categories.
          </p>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- performance
function PerformanceTab() {
  const { business } = useSession();
  const cur = business.currency;
  const [[start, end], setPeriod] = useState<[string, string]>(thisMonth);
  const [p, setP] = useState<Performance | null>(null);
  useEffect(() => { setP(null); api.get<Performance>(`/staff/report?start=${start}&end=${end}`).then(setP).catch((e) => toast(e.message)); }, [start, end]);
  const top = p?.rows.reduce((a, r) => Math.max(a, Number(r.sales)), 0) || 1;
  return (
    <section className="panel">
      <div className="att-head"><h2>Performance <span className="muted small">{dateRange(start, end)}</span></h2></div>
      <PeriodPicker start={start} end={end} onChange={(a, b) => setPeriod([a, b])} />
      {!p ? <Loading /> : p.rows.length === 0 ? <div className="empty">Add your team first.</div> : (
        <div className="perf">
          {p.rows.map((r, i) => (
            <div className="perf-card" key={r.stylist_id}>
              <div className="perf-top">
                <Avatar name={r.name} color={r.color} size={40} />
                <div><b>{r.name}</b>{i === 0 && Number(r.sales) > 0 && <span className="st-chip t-ok" style={{ marginLeft: 8 }}>Top sales</span>}
                  <div className="perf-bar"><i style={{ width: `${(Number(r.sales) / top) * 100}%`, background: r.color }} /></div></div>
                <div className="perf-sales"><b>{money(r.sales, cur)}</b><span className="small muted">{r.completed} done · avg {money(r.avg_ticket, cur)}</span></div>
              </div>
              <dl className="perf-stats">
                <div><dt>Clients</dt><dd>{r.clients}<small> · {r.repeat_clients} returning</small></dd></div>
                <div><dt>Diary filled</dt><dd>{r.utilisation}%<small> · {r.booked_hours}h of {r.scheduled_hours}h</small></dd></div>
                <div><dt>Hours worked</dt><dd>{r.worked_hours}h</dd></div>
                <div><dt>Commission</dt><dd>{money(r.commission, cur)}</dd></div>
                <div><dt>No-shows</dt><dd className={r.no_shows ? "warn-t" : undefined}>{r.no_shows}<small> · {r.cancelled} cancelled</small></dd></div>
                <div><dt>Late · Absent</dt><dd className={r.late || r.absent ? "warn-t" : undefined}>{r.late} · {r.absent}<small> · {r.leave_days} leave</small></dd></div>
              </dl>
            </div>
          ))}
        </div>
      )}
      <p className="note" style={{ margin: "12px 0 0" }}>
        &quot;Diary filled&quot; is booked time against their working hours (leave days left out). &quot;Returning&quot; clients had been served by the same person before.
      </p>
    </section>
  );
}

