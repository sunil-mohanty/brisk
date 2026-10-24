"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppointmentSheet, STATUS_LABEL, type SheetState } from "@/components/AppointmentSheet";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session";
import { Tip } from "@/components/Tips";
import { ErrorBox, Loading, PageHead, Pill } from "@/components/ui";
import { api } from "@/lib/api";
import { addDays, fmtDayLong, fmtTime, todayUAE, uaeDate, uaeMinutes, uaeTime } from "@/lib/format";
import type { Appointment, CatalogItem, Lead, Quote, Stylist } from "@/lib/types";
import { vocab } from "@/lib/vocab";

type View = "day" | "week" | "month" | "list";
const VIEWS: View[] = ["day", "week", "month", "list"];
const HOUR = 64; // px per hour
const ANYONE = { id: -1, name: "Anyone", role: "Not assigned", color: "#9a8778" };

/* Pastel blocks per service category, like the reference calendar */
const PASTELS = [
  { bg: "#fbdcb6", ink: "#6b3d12" }, // peach
  { bg: "#f9dbe1", ink: "#7a2f3e" }, // pink
  { bg: "#c4ecd3", ink: "#1f5a37" }, // mint
  { bg: "#c4e4f7", ink: "#1d4f6b" }, // sky
  { bg: "#e4dbf5", ink: "#4b3a78" }, // lavender
  { bg: "#f4e8b4", ink: "#6b5712" }, // butter
];
const FIXED: Record<string, number> = { hair: 0, colour: 1, nails: 2, bridal: 3, skin: 4, "brows & lashes": 4, grooming: 5, beard: 5, massage: 3, makeup: 1 };
function pastel(category: string | null | undefined) {
  const k = (category ?? "").toLowerCase();
  if (k in FIXED) return PASTELS[FIXED[k]];
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PASTELS[k ? h % PASTELS.length : 0];
}

const weekStart = (d: string) => { const wd = (new Date(d + "T12:00:00+04:00").getUTCDay() + 6) % 7; return addDays(d, -wd); };
const monthStart = (d: string) => d.slice(0, 8) + "01";
const dayParts = (d: string) => { const dt = new Date(d + "T12:00:00+04:00"); return { wd: dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Dubai" }), n: dt.getUTCDate(), mon: dt.toLocaleDateString("en-GB", { month: "short", timeZone: "Asia/Dubai" }) }; };
const fmtHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function hourLabel(m: number) {
  const h = Math.floor(m / 60);
  return `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`;
}

export default function AppointmentsPage() {
  return <Suspense fallback={<Loading />}><Calendar /></Suspense>;
}

function Calendar() {
  const router = useRouter();
  const params = useSearchParams();
  const { business } = useSession();
  const v = vocab(business.business_type);
  const [view, setView] = useState<View>((VIEWS as string[]).includes(params.get("view") ?? "") ? (params.get("view") as View) : "week");
  const [anchor, setAnchor] = useState(params.get("day") ?? todayUAE());
  const [staff, setStaff] = useState<number | "all">("all");
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [team, setTeam] = useState<Stylist[] | null>(null);
  const [menu, setMenu] = useState<CatalogItem[]>([]);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [error, setError] = useState<string | null>(null);

  const [first, last] = useMemo((): [string, string] => {
    if (view === "day") return [anchor, anchor];
    if (view === "week") { const s = weekStart(anchor); return [s, addDays(s, 6)]; }
    if (view === "month") { const s = weekStart(monthStart(anchor)); return [s, addDays(s, 41)]; }
    return [anchor, addDays(anchor, 13)];
  }, [view, anchor]);

  const load = useCallback(() => {
    api.swr<Appointment[]>(`/appointments?start=${first}&end=${last}`, setAppts).catch((e) => setError(e.message));
  }, [first, last]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.swr<Stylist[]>("/team", setTeam).catch(() => setTeam([]));
    api.swr<CatalogItem[]>("/catalog", setMenu).catch(() => {});
  }, []);
  useEffect(() => { router.replace(`/appointments?view=${view}&day=${anchor}`, { scroll: false }); }, [view, anchor, router]);

  // Deep links: ?lead=12, ?quote=5, ?new=1, ?id=40
  useEffect(() => {
    const lead = params.get("lead"), quote = params.get("quote"), id = params.get("id");
    if (lead) {
      api.get<Lead[]>("/leads").then((ls) => {
        const l = ls.find((x) => String(x.id) === lead);
        if (l) setSheet({ kind: "new", preset: { leadId: l.id, customerId: l.customer.id, service: l.service_interest ?? "", date: l.preferred_date ?? undefined, notes: l.requirement ?? "", title: `Book ${l.customer.name.split(" ")[0]}` } });
      });
    } else if (quote) {
      api.get<Quote>(`/quotes/${quote}`).then((q) => setSheet({ kind: "new", preset: {
        quoteId: q.id, customerId: q.customer.id, service: q.items.map((i) => i.description).join(" + ").slice(0, 300),
        price: String(Number(q.totals.total)), notes: q.reference ?? "", title: `Book ${q.customer.name.split(" ")[0]} (${q.label})`,
      } }));
    } else if (id) {
      api.get<Appointment>(`/appointments/${id}`).then((a) => { setAnchor(uaeDate(a.starts_at)); setSheet({ kind: "view", appt: a }); });
    } else if (params.get("new")) setSheet({ kind: "new", preset: { date: anchor } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catOf = useMemo(() => {
    const m = new Map(menu.map((c) => [c.name.trim().toLowerCase(), c.category]));
    return (a: Appointment) => m.get(a.service.split(" + ")[0].trim().toLowerCase()) ?? null;
  }, [menu]);

  const shown = useMemo(() => (appts ?? []).filter((a) => staff === "all" || a.stylist?.id === staff), [appts, staff]);
  const live = shown.filter((a) => a.status !== "cancelled");

  function step(dir: -1 | 1) {
    if (view === "day") setAnchor(addDays(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else if (view === "list") setAnchor(addDays(anchor, dir * 14));
    else { const [y, m] = anchor.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + dir, 1)); setAnchor(d.toISOString().slice(0, 10)); }
  }
  const rangeLabel = (() => {
    const a = dayParts(first), b = dayParts(last);
    if (view === "day") return fmtDayLong(anchor);
    if (view === "month") { const d = new Date(anchor + "T12:00:00+04:00"); return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Dubai" }); }
    return a.mon === b.mon ? `${a.mon} ${a.n} – ${b.n}` : `${a.mon} ${a.n} – ${b.mon} ${b.n}`;
  })();
  const book = (date: string, minutes?: number, stylistId?: number | null) =>
    setSheet({ kind: "new", preset: { date, time: minutes !== undefined ? fmtHM(minutes) : undefined, stylistId: stylistId && stylistId > 0 ? stylistId : staff !== "all" ? staff : null } });
  const open = (a: Appointment) => setSheet({ kind: "view", appt: a });

  return (
    <>
      <PageHead
        title="Appointments"
        eyebrow={appts ? `${live.length} booked` : undefined}
        action={<Tip id="ap.new" order={1} text="Book a client in. Or tap any free space in the calendar to book that exact time."><button className="btn primary" onClick={() => book(view === "day" ? anchor : todayUAE())}>{Icon.appointments()}New Booking</button></Tip>}
      />
      <ErrorBox error={error} />
      <div className="cal-tools">
        <div className="seg seg-wide" role="tablist" aria-label="Calendar view">
          {VIEWS.map((x) => <button key={x} type="button" role="tab" aria-selected={view === x} aria-pressed={view === x} onClick={() => setView(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}
        </div>
        <label className="staffpick">
          {Icon.staff()}
          <select value={staff} onChange={(e) => setStaff(e.target.value === "all" ? "all" : Number(e.target.value))} aria-label="Show staff">
            <option value="all">All staff</option>
            {(team ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      </div>
      <div className="cal-nav">
        <button type="button" className="navbtn" aria-label="Previous" onClick={() => step(-1)}>‹</button>
        <b className="cal-range">{rangeLabel}</b>
        <button type="button" className="navbtn" aria-label="Next" onClick={() => step(1)}>›</button>
        <button type="button" className="todaylink" onClick={() => setAnchor(todayUAE())}>Back to today</button>
      </div>

      {!appts || !team ? <Loading /> : (
        <>
          {view === "day" && <DayView day={anchor} appts={shown} team={staff === "all" ? team : team.filter((m) => m.id === staff)} staffLabel={v.staff} catOf={catOf} onOpen={open} onBook={book} />}
          {view === "week" && <WeekView start={first} appts={shown} catOf={catOf} onOpen={open} onBook={book} />}
          {view === "month" && <MonthView start={first} anchor={anchor} appts={shown} catOf={catOf} onOpen={open} onPickDay={(d) => { setAnchor(d); setView("day"); }} />}
          {view === "list" && <ListView appts={shown} catOf={catOf} onOpen={open} />}
        </>
      )}
      {team && team.length === 0 && appts && (
        <p className="note" style={{ marginTop: 12 }}>Add your staff in <a href="/team">Staff</a> to see one column per {v.staff.toLowerCase()} in the day view and avoid double bookings.</p>
      )}
      <AppointmentSheet
        state={sheet}
        onClose={() => setSheet(null)}
        onChanged={(a) => {
          load();
          if (a && sheet?.kind !== "view") { setSheet(null); if (uaeDate(a.starts_at) < first || uaeDate(a.starts_at) > last) setAnchor(uaeDate(a.starts_at)); }
        }}
      />
    </>
  );
}

type CatOf = (a: Appointment) => string | null;

function useRange(appts: Appointment[]) {
  return useMemo(() => {
    let a = 9 * 60, b = 20 * 60;
    appts.forEach((x) => { a = Math.min(a, Math.floor(uaeMinutes(x.starts_at) / 60) * 60); b = Math.max(b, Math.ceil((uaeMinutes(x.starts_at) + x.duration_min) / 60) * 60); });
    return [a, Math.min(b, 24 * 60)] as const;
  }, [appts]);
}

function useNow() {
  const [now, setNow] = useState(() => uaeMinutes(new Date()));
  useEffect(() => { const t = setInterval(() => setNow(uaeMinutes(new Date())), 60000); return () => clearInterval(t); }, []);
  return now;
}

function Block({ a, cat, onOpen, style }: { a: Appointment; cat: string | null; onOpen: (a: Appointment) => void; style: React.CSSProperties }) {
  const c = pastel(cat);
  const h = Number(style.height ?? 0);
  const compact = h < 58;
  return (
    <button type="button" className={`ev s-${a.status}${compact ? " compact" : ""}`} style={{ ...style, background: c.bg, color: c.ink }} onClick={() => onOpen(a)}
      aria-label={`${a.customer.name}, ${a.service}, ${fmtTime(a.starts_at)}, ${STATUS_LABEL[a.status]}`}>
      {(a.status === "confirmed" || a.status === "completed") && <span className="ev-tick" aria-hidden="true">✓</span>}
      {compact ? (
        <span className="ev-line"><span className="ev-time">{uaeTime(a.starts_at)}</span> <b>{a.service}</b>{h > 40 && <span className="ev-who"> · {a.customer.name}</span>}</span>
      ) : (
        <>
          <span className="ev-time">{uaeTime(a.starts_at)} – {uaeTime(a.ends_at)}</span>
          <b>{a.service}</b>
          <span className="ev-who">{a.customer.name}</span>
          {h > 92 && a.stylist && <span className="ev-staff">{a.stylist.name}</span>}
        </>
      )}
    </button>
  );
}

/** Side-by-side lanes for overlapping bookings in one column. */
function lanes(list: Appointment[]) {
  const sorted = [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const out: { a: Appointment; lane: number; lanes: number }[] = [];
  let group: { a: Appointment; lane: number; end: number }[] = [];
  let groupEnd = -1;
  const flush = () => { const n = Math.max(1, ...group.map((g) => g.lane + 1)); group.forEach((g) => out.push({ a: g.a, lane: g.lane, lanes: n })); group = []; };
  for (const a of sorted) {
    const s = uaeMinutes(a.starts_at), e = s + a.duration_min;
    if (s >= groupEnd) { flush(); groupEnd = -1; }
    const used = new Set(group.filter((g) => g.end > s).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ a, lane, end: e });
    groupEnd = Math.max(groupEnd, e);
  }
  flush();
  return out;
}

function TimeGrid({ cols, from, to, children }: { cols: React.ReactNode[]; from: number; to: number; children: React.ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, ((Math.max(uaeMinutes(new Date()), from + 60) - from) / 60) * HOUR - 140);
  }, [from]);
  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  return (
    <div className="cal2">
      <div className="cal2-scroll" ref={scroller}>
        <div className="cal2-grid" style={{ "--cols": cols.length, "--hour": `${HOUR}px` } as React.CSSProperties}>
          <div className="cal2-corner" />
          {cols}
          <div className="cal2-times" style={{ height: ((to - from) / 60) * HOUR }}>
            {hours.map((h) => <span key={h} style={{ top: ((h - from) / 60) * HOUR }}>{hourLabel(h)}</span>)}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function Column({ from, to, appts, catOf, onOpen, onBook, nowAt, label }: {
  from: number; to: number; appts: Appointment[]; catOf: CatOf; onOpen: (a: Appointment) => void; onBook: (minutes: number) => void; nowAt: number | null; label: string;
}) {
  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  return (
    <div className="cal2-col" style={{ height: ((to - from) / 60) * HOUR }}>
      {hours.flatMap((h) => [0, 30].map((m) => (
        <button key={`${h}-${m}`} type="button" className="cal2-free" style={{ top: ((h + m - from) / 60) * HOUR, height: HOUR / 2 }}
          aria-label={`Book ${label} at ${fmtHM(h + m)}`} onClick={() => onBook(h + m)} />
      )))}
      {nowAt !== null && nowAt >= from && nowAt <= to && <div className="now2" style={{ top: ((nowAt - from) / 60) * HOUR }} aria-hidden="true" />}
      {lanes(appts).map(({ a, lane, lanes: n }) => (
        <Block key={a.id} a={a} cat={catOf(a)} onOpen={onOpen} style={{
          top: ((uaeMinutes(a.starts_at) - from) / 60) * HOUR + 2, height: Math.max(26, (a.duration_min / 60) * HOUR - 4),
          left: `calc(${(lane / n) * 100}% + 4px)`, width: `calc(${100 / n}% - 8px)`,
        }} />
      ))}
    </div>
  );
}

function WeekView({ start, appts, catOf, onOpen, onBook }: { start: string; appts: Appointment[]; catOf: CatOf; onOpen: (a: Appointment) => void; onBook: (d: string, m?: number) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [from, to] = useRange(appts);
  const now = useNow();
  const today = todayUAE();
  return (
    <TimeGrid from={from} to={to} cols={days.map((d) => {
      const p = dayParts(d);
      return <div key={d} className={`cal2-head${d === today ? " today" : ""}`}><span>{p.wd.toUpperCase()}</span><b>{p.n}</b></div>;
    })}>
      {days.map((d) => (
        <Column key={d} from={from} to={to} appts={appts.filter((a) => uaeDate(a.starts_at) === d)} catOf={catOf} onOpen={onOpen}
          onBook={(m) => onBook(d, m)} nowAt={d === today ? now : null} label={fmtDayLong(d)} />
      ))}
    </TimeGrid>
  );
}

function DayView({ day, appts, team, staffLabel, catOf, onOpen, onBook }: {
  day: string; appts: Appointment[]; team: Stylist[]; staffLabel: string; catOf: CatOf; onOpen: (a: Appointment) => void; onBook: (d: string, m?: number, s?: number | null) => void;
}) {
  const [from, to] = useRange(appts);
  const now = useNow();
  const unassigned = appts.some((a) => !a.stylist || !team.find((m) => m.id === a.stylist!.id));
  const cols = [...team.map((m) => ({ id: m.id, name: m.name, role: m.role ?? staffLabel, color: m.color })), ...(unassigned || !team.length ? [ANYONE] : [])];
  return (
    <TimeGrid from={from} to={to} cols={cols.map((c) => (
      <div key={c.id} className="cal2-head staff"><i style={{ background: c.color }} aria-hidden="true" /><b>{c.name}</b><span>{c.role}</span></div>
    ))}>
      {cols.map((c) => (
        <Column key={c.id} from={from} to={to}
          appts={appts.filter((a) => (c.id === -1 ? !a.stylist || !team.find((m) => m.id === a.stylist!.id) : a.stylist?.id === c.id))}
          catOf={catOf} onOpen={onOpen} onBook={(m) => onBook(day, m, c.id)} nowAt={day === todayUAE() ? now : null} label={c.name} />
      ))}
    </TimeGrid>
  );
}

function MonthView({ start, anchor, appts, catOf, onOpen, onPickDay }: { start: string; anchor: string; appts: Appointment[]; catOf: CatOf; onOpen: (a: Appointment) => void; onPickDay: (d: string) => void }) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const month = anchor.slice(0, 7);
  const today = todayUAE();
  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    appts.filter((a) => a.status !== "cancelled").forEach((a) => { const d = uaeDate(a.starts_at); m.set(d, [...(m.get(d) ?? []), a]); });
    m.forEach((xs) => xs.sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
    return m;
  }, [appts]);
  return (
    <div className="month">
      {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => <div key={d} className="month-wd">{d}</div>)}
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        return (
          <div key={d} className={`month-day${d.slice(0, 7) !== month ? " out" : ""}${d === today ? " today" : ""}`}>
            <button type="button" className="month-n" onClick={() => onPickDay(d)} aria-label={`Open ${fmtDayLong(d)}`}>{dayParts(d).n}</button>
            {list.slice(0, 3).map((a) => {
              const c = pastel(catOf(a));
              return <button key={a.id} type="button" className="month-ev" style={{ background: c.bg, color: c.ink }} onClick={() => onOpen(a)}>{uaeTime(a.starts_at)} {a.customer.name.split(" ")[0]}</button>;
            })}
            {list.length > 3 && <button type="button" className="month-more" onClick={() => onPickDay(d)}>+{list.length - 3} more</button>}
          </div>
        );
      })}
    </div>
  );
}

function ListView({ appts, catOf, onOpen }: { appts: Appointment[]; catOf: CatOf; onOpen: (a: Appointment) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    [...appts].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).forEach((a) => { const d = uaeDate(a.starts_at); m.set(d, [...(m.get(d) ?? []), a]); });
    return [...m.entries()];
  }, [appts]);
  if (!groups.length) return <div className="panel empty">Nothing booked in these two weeks.</div>;
  return (
    <div className="stack">
      {groups.map(([d, list]) => (
        <section className="panel" key={d}>
          <h2>{fmtDayLong(d)} <span className="muted small">{list.length} booked</span></h2>
          <div className="list">
            {list.map((a) => (
              <button key={a.id} type="button" className="slot" style={{ "--c": pastel(catOf(a)).bg } as React.CSSProperties} onClick={() => onOpen(a)}>
                <time>{fmtTime(a.starts_at)}<small>{a.duration_min} min</small></time>
                <i aria-hidden="true" />
                <span className="l"><b>{a.customer.name}</b><span>{a.service}{a.stylist ? ` · ${a.stylist.name}` : ""}</span></span>
                <Pill status={a.status} label={STATUS_LABEL[a.status]} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
