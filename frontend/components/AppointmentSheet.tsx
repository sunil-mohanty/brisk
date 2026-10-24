"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CustomerPicker } from "@/components/CustomerPicker";
import { Sheet } from "@/components/Sheet";
import { useSession } from "@/components/session";
import { words } from "@/lib/words";
import { copyText, ErrorBox, Pill, toast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { addDays, atUAE, fmtDayLong, fmtTime, money, todayUAE, uaeDate, uaeTime } from "@/lib/format";
import type { Appointment, AppointmentStatus, CatalogItem, CustomerRef, MessageLink, Stylist } from "@/lib/types";
import { duration, vocab } from "@/lib/vocab";

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: "Booked", confirmed: "Confirmed", arrived: "In the chair", completed: "Finished", no_show: "No-show", cancelled: "Cancelled",
};

export interface NewPreset {
  date?: string;
  time?: string;
  stylistId?: number | null;
  leadId?: number;
  quoteId?: number;
  customerId?: number;
  service?: string;
  price?: string;
  durationMin?: number;
  location?: "salon" | "home";
  address?: string;
  notes?: string;
  title?: string;
}

export type SheetState = { kind: "new"; preset?: NewPreset } | { kind: "view"; appt: Appointment } | { kind: "edit"; appt: Appointment } | null;

/** One sheet for booking, viewing, rescheduling and finishing appointments. */
export function AppointmentSheet({ state, onClose, onChanged }: { state: SheetState; onClose: () => void; onChanged: (a?: Appointment) => void }) {
  return (
    <Sheet open={!!state} onClose={onClose}>
      {state?.kind === "new" && <BookForm preset={state.preset} onClose={onClose} onSaved={onChanged} />}
      {state?.kind === "edit" && <BookForm appt={state.appt} onClose={onClose} onSaved={onChanged} />}
      {state?.kind === "view" && <ApptView appt={state.appt} onClose={onClose} onChanged={onChanged} />}
    </Sheet>
  );
}

const DURATIONS = [30, 45, 60, 90, 120, 180];

function useTeamAndMenu() {
  const [team, setTeam] = useState<Stylist[]>([]);
  const [menu, setMenu] = useState<CatalogItem[]>([]);
  useEffect(() => {
    api.swr<Stylist[]>("/team", setTeam).catch(() => {});
    api.swr<CatalogItem[]>("/catalog", setMenu).catch(() => {});
  }, []);
  return { team, menu };
}

function BookForm({ preset, appt, onClose, onSaved }: { preset?: NewPreset; appt?: Appointment; onClose: () => void; onSaved: (a?: Appointment) => void }) {
  const { business } = useSession();
  const v = vocab(business.business_type);
  const W = words(business.business_type);
  const { team, menu } = useTeamAndMenu();
  const cur = business.currency;
  const editing = !!appt;
  const [ref, setRef] = useState<CustomerRef>({});
  const [f, setF] = useState(() => ({
    service: appt?.service ?? preset?.service ?? "",
    date: appt ? uaeDate(appt.starts_at) : preset?.date ?? todayUAE(),
    time: appt ? uaeTime(appt.starts_at) : preset?.time ?? nextHalfHour(),
    duration: appt?.duration_min ?? preset?.durationMin ?? 60,
    price: appt ? String(Number(appt.price)) : preset?.price ?? "",
    stylist: appt ? appt.stylist?.id ?? null : preset?.stylistId ?? null,
    location: appt?.location ?? preset?.location ?? (business.business_type === "home" ? "home" : "salon"),
    address: appt?.address ?? preset?.address ?? "",
    notes: appt?.notes ?? preset?.notes ?? "",
  }));
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, val: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: val })); setClash(null); };

  // Tapping menu items builds the service, price and time together.
  function toggle(item: CatalogItem) {
    const on = picked.includes(item.name);
    const next = on ? picked.filter((n) => n !== item.name) : [...picked, item.name];
    setPicked(next);
    const chosen = menu.filter((m) => next.includes(m.name));
    setF((x) => ({
      ...x,
      service: next.join(" + "),
      price: chosen.length ? String(chosen.reduce((a, m) => a + Number(m.unit_price), 0)) : x.price,
      duration: chosen.reduce((a, m) => a + (m.duration_min ?? 0), 0) || x.duration,
    }));
    setClash(null);
  }

  // Booking from an enquiry: pre-select the services the client asked for, with their price and time.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || editing || !menu.length || !f.service) return;
    seeded.current = true;
    const wanted = f.service.split(/,\s*|\s+\+\s+/).map((x) => x.trim().toLowerCase());
    const chosen = menu.filter((m) => wanted.includes(m.name.toLowerCase()));
    if (!chosen.length) return;
    setPicked(chosen.map((m) => m.name));
    setF((x) => ({
      ...x,
      service: chosen.map((m) => m.name).join(" + "),
      price: x.price || String(chosen.reduce((a, m) => a + Number(m.unit_price), 0)),
      duration: preset?.durationMin ?? (chosen.reduce((a, m) => a + (m.duration_min ?? 0), 0) || x.duration),
    }));
  }, [menu, editing, f.service, preset?.durationMin]);

  const groups = useMemo(() => {
    const g = new Map<string, CatalogItem[]>();
    menu.forEach((m) => g.set(m.category || "Services", [...(g.get(m.category || "Services") ?? []), m]));
    return [...g.entries()];
  }, [menu]);

  async function save(force = false) {
    if (!f.service.trim()) return setError(`Pick a ${W.service} from the list or type one.`);
    if (!f.date || !f.time) return setError("Choose a day and time.");
    setBusy(true);
    setError(null);
    const body = {
      service: f.service.trim(),
      starts_at: atUAE(f.date, f.time),
      duration_min: f.duration,
      price: Number(f.price) || 0,
      stylist_id: f.stylist,
      location: f.location,
      address: f.location === "home" ? f.address.trim() || null : null,
      notes: f.notes.trim() || null,
      force,
    };
    try {
      const a = editing
        ? await api.patch<Appointment>(`/appointments/${appt!.id}`, body)
        : await api.post<Appointment>("/appointments", {
            ...body,
            ...(preset?.leadId ? { lead_id: preset.leadId } : preset?.quoteId ? { quote_id: preset.quoteId } : ref),
          });
      toast(editing ? `${W.Appointment} moved` : `Booked: ${a.customer.name}, ${fmtTime(a.starts_at)}`);
      onSaved(a);
    } catch (e) {
      if (e instanceof ApiError && e.code === "clash") setClash(e.message);
      else setError((e as Error).message);
    }
    setBusy(false);
  }

  const locked = !!preset?.leadId || !!preset?.quoteId || editing;
  return (
    <>
      <h2>{editing ? `Change ${W.appointment}` : preset?.title ?? `Book ${W.vertical === "real_estate" ? "a viewing" : "an appointment"}`}</h2>
      <p className="intro">{editing ? `${appt!.customer.name} · ${appt!.service}` : `Client, ${W.service}, time and ${W.vertical === "real_estate" ? "which agent" : "who's doing it"}. You can send the confirmation on WhatsApp next.`}</p>
      <ErrorBox error={error} />
      <div className="form" style={{ marginTop: error ? 12 : 0 }}>
        {!editing && <CustomerPicker value={preset?.customerId} onChange={setRef} locked={locked} />}
        {!editing && groups.length > 0 && (
          <div className="full pricechips">
            <span className="small muted">Tap services from your menu</span>
            {groups.map(([cat, items]) => (
              <div className="chips-inline" key={cat}>
                {items.map((m) => (
                  <button type="button" key={m.id} className="chip" aria-pressed={picked.includes(m.name)} onClick={() => toggle(m)}>
                    {m.name}{m.duration_min ? <span className="mono"> {duration(m.duration_min)}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <label className="full">{W.Service}<input id="ap-service" value={f.service} onChange={(e) => set("service", e.target.value)} placeholder={v.itemPlaceholder} maxLength={300} /></label>
        <label>Day<input id="ap-date" type="date" value={f.date} min={editing ? undefined : addDays(todayUAE(), -1)} onChange={(e) => set("date", e.target.value)} /></label>
        <label>Time<input id="ap-time" type="time" step={300} value={f.time} onChange={(e) => set("time", e.target.value)} /></label>
        <div className="full">
          <label htmlFor="ap-dur">How long</label>
          <div className="durpick" style={{ marginTop: 5 }}>
            {DURATIONS.map((d) => <button type="button" key={d} className="chip" aria-pressed={f.duration === d} onClick={() => set("duration", d)}>{duration(d)}</button>)}
            <input id="ap-dur" type="number" min={5} max={720} step={5} value={f.duration} onChange={(e) => set("duration", Number(e.target.value) || 60)} style={{ width: 96 }} aria-label="Minutes" />
          </div>
        </div>
        {team.length > 0 && (
          <div className="full">
            <label>{v.staff}</label>
            <div className="chips-inline" style={{ marginTop: 5 }}>
              <button type="button" className="chip" aria-pressed={f.stylist === null} onClick={() => set("stylist", null)}>Anyone</button>
              {team.map((m) => (
                <button type="button" key={m.id} className="chip" aria-pressed={f.stylist === m.id} onClick={() => set("stylist", m.id)}>
                  <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 10, borderRadius: "99px 99px 2px 2px", background: m.color, marginRight: 6 }} />{m.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <label>Price ({cur})<input id="ap-price" type="number" min="0" step="1" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="0" /></label>
        <div>
          <label>Where</label>
          <div className="seg" style={{ marginTop: 5 }}>
            <button type="button" aria-pressed={f.location === "salon"} onClick={() => set("location", "salon")}>{W.vertical === "real_estate" ? "At our office" : "At the salon"}</button>
            <button type="button" aria-pressed={f.location === "home"} onClick={() => set("location", "home")}>{W.vertical === "real_estate" ? "At the property" : "Home visit"}</button>
          </div>
        </div>
        {f.location === "home" && <label className="full">{W.vertical === "real_estate" ? "Property address / unit" : "Client's address"}<input id="ap-address" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder={v.refPlaceholder} /></label>}
        <label className="full">Notes <textarea id="ap-notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder={W.vertical === "real_estate" ? "Keys with security, parking, documents to bring…" : "Anything to prepare, allergies to products, patch test done…"} /></label>
      </div>
      {clash && (
        <div className="clash" role="alert" style={{ marginTop: 14 }}>
          <span>{clash}</span>
          <button className="btn sm" onClick={() => save(true)} disabled={busy}>Book anyway</button>
        </div>
      )}
      <div className="foot">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => save(false)} disabled={busy}>{busy ? "Saving…" : editing ? "Save new time" : `Book ${W.appointment}`}</button>
      </div>
    </>
  );
}

function nextHalfHour() {
  const now = new Date();
  const [h, m] = uaeTime(now).split(":").map(Number);
  const mins = Math.min(21 * 60, Math.ceil((h * 60 + m + 15) / 30) * 30);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function ApptView({ appt, onClose, onChanged }: { appt: Appointment; onClose: () => void; onChanged: (a?: Appointment) => void }) {
  const { business } = useSession();
  const v = vocab(business.business_type);
  const W = words(business.business_type);
  const [a, setA] = useState(appt);
  const [finishing, setFinishing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const cur = business.currency;
  const live = a.status === "booked" || a.status === "confirmed" || a.status === "arrived";

  async function status(s: AppointmentStatus) {
    setBusy(true);
    try {
      const u = await api.patch<Appointment>(`/appointments/${a.id}`, { status: s });
      setA(u);
      toast(`${a.customer.name}: ${STATUS_LABEL[s].toLowerCase()}`);
      onChanged(u);
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }

  async function message(kind: "confirm" | "reminder" | "cancel") {
    // Open the tab inside the click so pop-up blockers allow it, then point it at WhatsApp.
    const w = window.open("about:blank", "_blank");
    try {
      const r = await api.post<MessageLink>(`/appointments/${a.id}/message?kind=${kind}`);
      if (r.whatsapp_url && w) w.location.href = r.whatsapp_url;
      else { w?.close(); await copyText(r.message); toast("No mobile number saved. Message copied instead."); }
      const u = await api.get<Appointment>(`/appointments/${a.id}`);
      setA(u);
      onChanged(u);
    } catch (e) { w?.close(); toast((e as Error).message); }
  }

  async function remove() {
    if (!window.confirm(`Delete ${a.customer.name}'s ${W.appointment}? This can't be undone. To keep a record, mark it cancelled instead.`)) return;
    try { await api.del(`/appointments/${a.id}`); toast(`${W.Appointment} deleted`); onChanged(); onClose(); } catch (e) { toast((e as Error).message); }
  }

  if (editing) return <BookForm appt={a} onClose={() => setEditing(false)} onSaved={(u) => { if (u) setA(u); setEditing(false); onChanged(u); }} />;
  if (finishing) return <Finish appt={a} onBack={() => setFinishing(false)} onDone={(u) => { setA(u); setFinishing(false); onChanged(u); }} rebook={v.rebookWeeks} />;

  return (
    <div className="appt-sheet">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <p className="when">{fmtDayLong(uaeDate(a.starts_at))}, {fmtTime(a.starts_at)} – {fmtTime(a.ends_at)}</p>
          <h2 style={{ margin: 0 }}>{a.customer.name}</h2>
          <div className="meta">{a.service}</div>
        </div>
        <Pill status={a.status} label={STATUS_LABEL[a.status]} />
      </div>
      <dl>
        <dt>{v.staff}</dt><dd>{a.stylist?.name ?? "Anyone"}</dd>
        <dt>Price</dt><dd>{money(a.price, cur)} · {duration(a.duration_min)}</dd>
        <dt>Where</dt><dd>{a.location === "home" ? `${W.vertical === "real_estate" ? "At the property" : "Home visit"}${a.address ? ` · ${a.address}` : ""}` : W.vertical === "real_estate" ? "At our office" : "At the salon"}</dd>
        <dt>Mobile</dt><dd>{a.customer.phone ?? <span className="muted">Not saved</span>}</dd>
        {a.notes && (<><dt>Notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{a.notes}</dd></>)}
        {a.confirmed_at && (<><dt>Confirmation</dt><dd>Sent {new Date(a.confirmed_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</dd></>)}
      </dl>

      {live && (
        <div className="acts">
          {a.status === "booked" && <button className="btn wa" onClick={() => message("confirm")}>Send confirmation</button>}
          {a.status !== "booked" && <button className="btn" onClick={() => message("reminder")}>Send reminder</button>}
          {a.status !== "arrived" && <button className="btn" onClick={() => status("arrived")} disabled={busy}>Client arrived</button>}
          <button className="btn primary" onClick={() => setFinishing(true)}>{W.vertical === "real_estate" ? "Record the outcome" : "Finish & record visit"}</button>
        </div>
      )}
      {a.status === "completed" && (
        <p className="note" style={{ marginTop: 14 }}>Finished. The {W.visit} is in {a.customer.name.split(" ")[0]}'s history. <Link href="/services">See {W.visits}</Link></p>
      )}
      {(a.status === "no_show" || a.status === "cancelled") && (
        <div className="acts"><button className="btn" onClick={() => status("booked")} disabled={busy}>Re-open booking</button></div>
      )}
      <div className="statusrow">
        {live && <button className="btn sm ghost" onClick={() => setEditing(true)}>Change time or details</button>}
        {live && <button className="btn sm ghost" onClick={() => status("no_show")} disabled={busy}>No-show</button>}
        {live && <button className="btn sm ghost" onClick={async () => { await status("cancelled"); if (a.customer.phone && window.confirm("Let the client know on WhatsApp?")) message("cancel"); }} disabled={busy}>Cancel booking</button>}
        <a className="btn sm ghost" href={a.public_url} target="_blank" rel="noreferrer">Client's page</a>
        {a.status !== "completed" && <button className="btn sm ghost danger" onClick={remove}>Delete</button>}
      </div>
      <div className="foot"><button className="btn" onClick={onClose}>Close</button></div>
    </div>
  );
}

function Finish({ appt, onBack, onDone, rebook }: { appt: Appointment; onBack: () => void; onDone: (a: Appointment) => void; rebook: number }) {
  const { business } = useSession();
  const W = words(business.business_type);
  const [price, setPrice] = useState(String(Number(appt.price)));
  const [notes, setNotes] = useState(appt.notes ?? "");
  const [weeks, setWeeks] = useState(rebook);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function done() {
    setBusy(true);
    try {
      const a = await api.post<Appointment>(`/appointments/${appt.id}/complete`, { price: Number(price) || 0, notes: notes.trim() || null, next_visit_weeks: weeks || null });
      toast(weeks ? `${W.Visit} saved. We'll remind you to follow up in ${weeks} weeks.` : `${W.Visit} saved`);
      onDone(a);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return (
    <>
      <h2>{W.vertical === "real_estate" ? `Record ${appt.customer.name.split(" ")[0]}'s deal` : `Finish ${appt.customer.name.split(" ")[0]}'s visit`}</h2>
      <p className="intro">{W.vertical === "real_estate" ? "Saves the deal (commission, notes) to their history and sets a follow-up, e.g. before the tenancy renews." : "Saves the visit to their history and sets a reminder to invite them back."}</p>
      <ErrorBox error={error} />
      <div className="form" style={{ marginTop: error ? 12 : 0 }}>
        <label>{W.vertical === "real_estate" ? "Commission / fee" : "Amount paid"} ({business.currency})<input id="fin-price" type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <div>
          <label>{W.vertical === "real_estate" ? "Follow up in" : "Invite back in"}</label>
          <div className="chips-inline" style={{ marginTop: 5 }}>
            {(W.vertical === "real_estate" ? [4, 12, 26, 44, 52] : [2, 3, 4, 6, 8, 12]).map((w) => <button type="button" key={w} className="chip" aria-pressed={weeks === w} onClick={() => setWeeks(w)}>{w} wk</button>)}
            <button type="button" className="chip" aria-pressed={weeks === 0} onClick={() => setWeeks(0)}>No reminder</button>
          </div>
        </div>
        <label className="full">Notes for next time<textarea id="fin-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={W.vertical === "real_estate" ? "Unit, contract dates, renewal, landlord or buyer details…" : "Colour formula, products used, length taken off…"} /></label>
      </div>
      <div className="foot">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn primary" onClick={done} disabled={busy}>{busy ? "Saving…" : `Save ${W.visit}`}</button>
      </div>
    </>
  );
}
