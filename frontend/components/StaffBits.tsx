"use client";

import { useState } from "react";
import { addDays, fmtDay, fmtTime, todayUAE } from "@/lib/format";
import type { DayStatus, LeaveKind, StaffToday } from "@/lib/types";

export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return <span className="st-av" style={{ "--c": color, width: size, height: size, fontSize: size * 0.36 } as React.CSSProperties} aria-hidden="true">{initials(name)}</span>;
}

export const STATUS: Record<DayStatus, { label: string; tone: string }> = {
  working: { label: "Working now", tone: "ok" },
  present: { label: "Present", tone: "ok" },
  late: { label: "Late", tone: "warn" },
  absent: { label: "Absent", tone: "bad" },
  leave: { label: "On leave", tone: "info" },
  off: { label: "Day off", tone: "muted" },
  upcoming: { label: "Not in yet", tone: "muted" },
};

export function StatusChip({ today }: { today: Pick<StaffToday, "status" | "hours" | "clock_in"> }) {
  const st = STATUS[today.status];
  const extra = today.status === "upcoming" && today.hours ? ` · starts ${today.hours[0]}`
    : (today.status === "working" || today.status === "late") && today.clock_in ? ` · in at ${fmtTime(today.clock_in)}` : "";
  return <span className={`st-chip t-${st.tone}`}>{st.label}{extra}</span>;
}

export const KIND: Record<LeaveKind, string> = { annual: "Annual leave", sick: "Sick leave", unpaid: "Unpaid leave", other: "Other" };
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const hours = (mins: number) => (mins ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${String(mins % 60).padStart(2, "0")}m` : ""}` : "–");

export function dateRange(a: string, b: string) {
  return a === b ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`;
}

/** This month / last month / custom dates, for commission and reports. */
export function PeriodPicker({ start, end, onChange }: { start: string; end: string; onChange: (s: string, e: string) => void }) {
  const today = todayUAE();
  const first = today.slice(0, 8) + "01";
  const lastStart = addDays(first, -1).slice(0, 8) + "01";
  const lastEnd = addDays(first, -1);
  const preset = start === first && end === today ? "this" : start === lastStart && end === lastEnd ? "last" : "custom";
  return (
    <div className="period">
      <div className="seg" role="group" aria-label="Period">
        <button type="button" aria-pressed={preset === "this"} onClick={() => onChange(first, today)}>This month</button>
        <button type="button" aria-pressed={preset === "last"} onClick={() => onChange(lastStart, lastEnd)}>Last month</button>
      </div>
      <label className="period-d">From<input type="date" value={start} max={end} onChange={(e) => e.target.value && onChange(e.target.value, end)} /></label>
      <label className="period-d">To<input type="date" value={end} min={start} onChange={(e) => e.target.value && onChange(start, e.target.value)} /></label>
    </div>
  );
}

export function thisMonth(): [string, string] {
  const t = todayUAE();
  return [t.slice(0, 8) + "01", t];
}

/** Ask for leave (staff) or record leave for someone (owner). */
export function LeaveForm({ people, busy, onSubmit, onCancel, submitLabel = "Send request" }: {
  people?: { id: number; name: string }[]; busy?: boolean; submitLabel?: string;
  onSubmit: (b: { kind: LeaveKind; start_date: string; end_date: string; reason: string | null; stylist_id?: number }) => void; onCancel?: () => void;
}) {
  const [kind, setKind] = useState<LeaveKind>("annual");
  const [from, setFrom] = useState(addDays(todayUAE(), 1));
  const [to, setTo] = useState(addDays(todayUAE(), 1));
  const [reason, setReason] = useState("");
  const [who, setWho] = useState<number | "">(people?.[0]?.id ?? "");
  return (
    <form className="form leaveform" onSubmit={(e) => { e.preventDefault(); onSubmit({ kind, start_date: from, end_date: to < from ? from : to, reason: reason.trim() || null, ...(people ? { stylist_id: Number(who) } : {}) }); }}>
      {people && (
        <label>Who<select value={who} onChange={(e) => setWho(Number(e.target.value))}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      )}
      <label>Type<select value={kind} onChange={(e) => setKind(e.target.value as LeaveKind)}>{(Object.keys(KIND) as LeaveKind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select></label>
      <label>First day<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></label>
      <label>Last day<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
      <label className="full">Reason <span className="hint">(optional)</span><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Family visit, doctor's appointment…" /></label>
      <div className="full acts" style={{ justifyContent: "flex-start" }}>
        <button className="btn primary" disabled={busy || (people && !who)}>{busy ? "Saving…" : submitLabel}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
