"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppointmentSheet, STATUS_LABEL, type SheetState } from "@/components/AppointmentSheet";
import { useSession } from "@/components/session";
import { Tip } from "@/components/Tips";
import { ErrorBox, Loading, PageHead } from "@/components/ui";
import { api } from "@/lib/api";
import { addDays, fmtDayLong, fmtTime, todayUAE, uaeDate, uaeMinutes } from "@/lib/format";
import type { Appointment, Lead, Quote, Stylist } from "@/lib/types";
import { vocab } from "@/lib/vocab";

const HOUR = 64; // px per hour in the diary
const ANYONE = { id: -1, name: "Anyone", role: "Not assigned", color: "#9a8778" } as const;

export default function AppointmentsPage() {
  return <Suspense fallback={<Loading />}><Diary /></Suspense>;
}

function Diary() {
  const router = useRouter();
  const params = useSearchParams();
  const { business } = useSession();
  const v = vocab(business.business_type);
  const [day, setDay] = useState(params.get("day") ?? todayUAE());
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [team, setTeam] = useState<Stylist[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sheet, setSheet] = useState<SheetState>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.swr<Appointment[]>(`/appointments?start=${day}&end=${day}`, setAppts).catch((e) => setError(e.message));
    // Dots on the day strip: two weeks from today
    const start = todayUAE();
    api.swr<Appointment[]>(`/appointments?start=${addDays(start, -1)}&end=${addDays(start, 13)}`, (xs) => {
      const c: Record<string, number> = {};
      xs.filter((a) => a.status !== "cancelled").forEach((a) => { const d = uaeDate(a.starts_at); c[d] = (c[d] ?? 0) + 1; });
      setCounts(c);
    }).catch(() => {});
  }, [day]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.swr<Stylist[]>("/team", setTeam).catch(() => setTeam([])); }, []);

  // Deep links: /appointments?lead=12, ?quote=5, ?new=1, ?id=40
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
      api.get<Appointment>(`/appointments/${id}`).then((a) => { setDay(uaeDate(a.starts_at)); setSheet({ kind: "view", appt: a }); });
    } else if (params.get("new")) setSheet({ kind: "new", preset: { date: day } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const columns = useMemo(() => {
    const t = team ?? [];
    const unassigned = (appts ?? []).some((a) => !a.stylist || !t.find((m) => m.id === a.stylist!.id));
    return [...t.map((m) => ({ id: m.id, name: m.name, role: m.role ?? v.staff, color: m.color })), ...(unassigned || !t.length ? [ANYONE] : [])];
  }, [team, appts, v.staff]);

  // Opening hours shown: 9am–9pm, stretched to fit any earlier/later bookings.
  const [from, to] = useMemo(() => {
    let a = 9 * 60, b = 21 * 60;
    (appts ?? []).forEach((x) => { a = Math.min(a, Math.floor(uaeMinutes(x.starts_at) / 60) * 60); b = Math.max(b, Math.ceil((uaeMinutes(x.starts_at) + x.duration_min) / 60) * 60); });
    return [a, Math.min(b, 24 * 60)];
  }, [appts]);

  const isToday = day === todayUAE();
  const [now, setNow] = useState(() => uaeMinutes(new Date()));
  useEffect(() => { const t = setInterval(() => setNow(uaeMinutes(new Date())), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!scroller.current || !appts) return;
    const target = isToday ? now : appts.length ? uaeMinutes(appts[0].starts_at) : from;
    scroller.current.scrollTop = Math.max(0, ((target - from) / 60) * HOUR - 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, appts === null]);

  const go = (d: string) => { setDay(d); setAppts(null); router.replace(`/appointments?day=${d}`, { scroll: false }); };
  const strip = Array.from({ length: 14 }, (_, i) => addDays(todayUAE(), i));
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60);
  const live = (appts ?? []).filter((a) => a.status !== "cancelled");
  const total = live.reduce((s, a) => s + Number(a.price), 0);

  const book = (minutes: number, stylistId: number) => {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0"), mm = String(minutes % 60).padStart(2, "0");
    setSheet({ kind: "new", preset: { date: day, time: `${hh}:${mm}`, stylistId: stylistId > 0 ? stylistId : null } });
  };

  return (
    <>
      <PageHead
        eyebrow={isToday ? "Today" : "Diary"}
        title={fmtDayLong(day)}
        sub={appts ? (live.length ? `${live.length} appointment${live.length === 1 ? "" : "s"} · ${business.currency} ${total.toLocaleString("en-US")} booked` : "Nothing booked yet. Tap a free slot to book.") : " "}
        action={<Tip id="ap.new" order={1} text="Book a client in. Or tap any free space in a stylist's column to book that exact time."><button className="btn primary" onClick={() => setSheet({ kind: "new", preset: { date: day } })}>+ Book appointment</button></Tip>}
      />
      <ErrorBox error={error} />
      <div className="diary-bar">
        <div className="daynav">
          <button type="button" aria-label="Previous day" onClick={() => go(addDays(day, -1))}>‹</button>
          <button type="button" aria-label="Next day" onClick={() => go(addDays(day, 1))}>›</button>
        </div>
        <div className="days" role="group" aria-label="Choose a day">
          {strip.map((d) => {
            const dt = new Date(d + "T12:00:00+04:00");
            return (
              <button key={d} type="button" aria-pressed={d === day} className={counts[d] ? "has" : ""} onClick={() => go(d)} aria-label={`${fmtDayLong(d)}${counts[d] ? `, ${counts[d]} booked` : ""}`}>
                {d === todayUAE() ? "Today" : dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Dubai" })}
                <b>{dt.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Asia/Dubai" })}</b>
                <em />
              </button>
            );
          })}
        </div>
        {day !== todayUAE() && <button className="btn sm" onClick={() => go(todayUAE())}>Today</button>}
      </div>

      {!appts || !team ? <Loading /> : (
        <div className="cal">
          <div className="cal-scroll" ref={scroller} style={{ maxHeight: "min(70vh, 760px)", overflowY: "auto" }}>
            <div className="cal-grid" style={{ "--cols": columns.length, "--hour": `${HOUR}px` } as React.CSSProperties}>
              <div className="cal-corner" style={{ position: "sticky", top: 0, zIndex: 3 }} />
              {columns.map((c) => (
                <div className="cal-colhead" key={c.id} style={{ "--c": c.color, position: "sticky", top: 0, zIndex: 3 } as React.CSSProperties}>
                  <i aria-hidden="true" />
                  <div style={{ minWidth: 0 }}><b>{c.name}</b><br /><span>{c.role}</span></div>
                </div>
              ))}
              <div className="cal-times" style={{ height: ((to - from) / 60) * HOUR }}>
                {hours.slice(1, -1).map((h) => <span key={h} style={{ top: ((h - from) / 60) * HOUR }}>{fmtHour(h)}</span>)}
              </div>
              {columns.map((c, ci) => {
                const mine = appts.filter((a) => (c.id === -1 ? !a.stylist || !team.find((m) => m.id === a.stylist!.id) : a.stylist?.id === c.id));
                return (
                  <div className="cal-col" key={c.id} style={{ height: ((to - from) / 60) * HOUR }}>
                    {hours.slice(0, -1).flatMap((h) => [0, 30].map((m) => (
                      <button key={`${h}-${m}`} type="button" className="cal-free" style={{ top: ((h + m - from) / 60) * HOUR, height: HOUR / 2 }}
                        aria-label={`Book ${c.id > 0 ? c.name : "anyone"} at ${fmtHour(h + m)}`} onClick={() => book(h + m, c.id)} />
                    )))}
                    {isToday && now >= from && now <= to && <div className={`now-line${ci === 0 ? " first" : ""}`} style={{ top: ((now - from) / 60) * HOUR }} aria-hidden="true" />}
                    {layout(mine).map(({ a, lane, lanes }) => {
                      const top = ((uaeMinutes(a.starts_at) - from) / 60) * HOUR;
                      const h = Math.max(26, (a.duration_min / 60) * HOUR - 3);
                      return (
                        <button key={a.id} type="button" className={`appt s-${a.status}`}
                          style={{ "--c": a.stylist?.color ?? c.color, top, height: h, left: `calc(${(lane / lanes) * 100}% + 4px)`, right: "auto", width: `calc(${100 / lanes}% - 8px)` } as React.CSSProperties}
                          onClick={() => setSheet({ kind: "view", appt: a })}
                          aria-label={`${a.customer.name}, ${a.service}, ${fmtTime(a.starts_at)}, ${STATUS_LABEL[a.status]}`}>
                          {(a.status === "confirmed" || a.status === "completed") && <span className="tick" aria-hidden="true">✓</span>}
                          <b>{a.customer.name}</b>
                          {h > 34 && <span>{fmtTime(a.starts_at)} · {a.service}</span>}
                          {h > 56 && <span>{STATUS_LABEL[a.status]}{a.location === "home" ? " · Home visit" : ""}</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="cal-legend">
            <span><i className="pill p-booked">Booked</i> not confirmed yet</span>
            <span><i className="pill p-confirmed">✓ Confirmed</i> client has the WhatsApp confirmation</span>
            <span><i className="pill p-arrived">In the chair</i></span>
          </div>
        </div>
      )}
      {team && team.length === 0 && appts && (
        <p className="note" style={{ marginTop: 12 }}>Add your team in <a href="/team">Team</a> to get one column per {v.staff.toLowerCase()} and avoid double bookings.</p>
      )}
      <AppointmentSheet
        state={sheet}
        onClose={() => { setSheet(null); if (params.toString() && !params.get("day")) router.replace(`/appointments?day=${day}`, { scroll: false }); }}
        onChanged={(a) => {
          load();
          if (a && sheet?.kind !== "view") { setSheet(null); if (uaeDate(a.starts_at) !== day) go(uaeDate(a.starts_at)); }
        }}
      />
    </>
  );
}

function fmtHour(m: number) {
  const h = Math.floor(m / 60), mm = m % 60;
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return mm ? `${h12}:${String(mm).padStart(2, "0")}` : `${h12} ${ap}`;
}

/** Side-by-side lanes for overlapping bookings in one column. */
function layout(list: Appointment[]) {
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
