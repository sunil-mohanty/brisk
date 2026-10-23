"use client";

import { Pill } from "@/components/ui";
import type { Health, PayState } from "@/lib/types";

export const HEALTH: Record<Health, { pill: string; label: string; hint: string }> = {
  active: { pill: "won", label: "Active", hint: "Used in the last 7 days" },
  new: { pill: "new", label: "New", hint: "Signed up in the last 3 days" },
  slipping: { pill: "soon", label: "Slipping", hint: "Not used for 8–21 days" },
  dormant: { pill: "due", label: "Dormant", hint: "Not used for more than 21 days" },
  never_started: { pill: "due", label: "Never started", hint: "No bookings, quotes or clients yet" },
};

export const PAY: Record<PayState, { pill: string; label: string }> = {
  paid: { pill: "won", label: "Paid" },
  trial: { pill: "new", label: "Trial" },
  trial_ended: { pill: "due", label: "Trial ended" },
  overdue: { pill: "due", label: "Overdue" },
  suspended: { pill: "neutral", label: "Paused" },
  no_plan: { pill: "neutral", label: "No plan" },
};

export const HealthPill = ({ h }: { h: Health }) => <span title={HEALTH[h].hint}><Pill status={HEALTH[h].pill} label={HEALTH[h].label} /></span>;
export const PayPill = ({ p }: { p: PayState }) => <Pill status={PAY[p].pill} label={PAY[p].label} />;

export function ago(iso: string | null): string {
  if (!iso) return "Never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d} days ago`;
  const m = Math.floor(d / 30);
  return `${m} month${m > 1 ? "s" : ""} ago`;
}

const EVENT_LABEL: Record<string, string> = {
  signup: "Signed up",
  login: "Signed in",
  profile_updated: "Updated business details",
  customers_imported: "Imported clients",
  qr_created: "Created a QR code",
  quote_created: "Created a quote",
  quote_accepted: "Client accepted a quote",
  quote_declined: "Client declined a quote",
  service_recorded: "Recorded a service",
  reminder_sent: "Sent a service reminder",
  lead_received: "Got a lead from a QR code",
  password_reset: "Reset password",
  payment_recorded: "Payment recorded",
  account_paused: "Account paused",
  account_reactivated: "Account switched back on",
};
export const eventLabel = (k: string) => EVENT_LABEL[k] ?? k.replace(/_/g, " ");

/** Last `days` days as a week-column grid (Mon at top). Filled = the SME used the app that day. */
export function ActivityGrid({ days, active, start }: { days: number; active: string[]; start?: string }) {
  const on = new Set(active);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = new Date(today);
  first.setDate(first.getDate() - (days - 1));
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // back to Monday
  const signup = start ? new Date(start + "T00:00:00") : null;
  const cells: { iso: string; state: "on" | "off" | "before" | "future"; label: string }[] = [];
  for (const d = new Date(first); d <= today || cells.length % 7; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
    const state = d > today ? "future" : signup && d < signup ? "before" : on.has(iso) ? "on" : "off";
    cells.push({ iso, state, label: `${label}: ${state === "on" ? "used" : state === "before" ? "before sign-up" : state === "future" ? "" : "not used"}` });
  }
  const weeks = Math.ceil(cells.length / 7);
  const months: { col: number; name: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    const d = new Date(cells[w * 7].iso + "T00:00:00");
    if (w === 0 || d.getDate() <= 7) months.push({ col: w, name: d.toLocaleDateString("en-GB", { month: "short" }) });
  }
  return (
    <div className="actgrid-wrap">
      <div className="actgrid-months" style={{ gridTemplateColumns: `repeat(${weeks}, 14px)` }}>
        {months.map((m) => <span key={m.col} style={{ gridColumn: m.col + 1 }}>{m.name}</span>)}
      </div>
      <div className="actgrid" style={{ gridTemplateColumns: `repeat(${weeks}, 14px)` }} role="img" aria-label={`Used on ${active.length} of the last ${days} days`}>
        {cells.map((c) => <i key={c.iso} className={`d-${c.state}`} title={c.label} />)}
      </div>
      <div className="actgrid-legend"><i className="d-off" /> not used <i className="d-on" /> used</div>
    </div>
  );
}
