"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { addDays, todayUAE } from "@/lib/format";
import type { Slots } from "@/lib/types";

export interface Pick { day: string; time: string }

const ampm = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`; };

/** Free times only, from the salon's diary. `slotsPath` is /public/q/{token}/slots or /public/c/{token}/slots. */
export function SlotPicker({ slotsPath, openDays, value, onChange }: { slotsPath: string; openDays: number[]; value: Pick | null; onChange: (p: Pick | null) => void }) {
  const days = Array.from({ length: 21 }, (_, i) => addDays(todayUAE(), i))
    .filter((d) => openDays.includes((new Date(d + "T12:00:00+04:00").getUTCDay() + 6) % 7))
    .slice(0, 14);
  const [day, setDay] = useState<string | null>(value?.day ?? null);
  const [slots, setSlots] = useState<Slots | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!day) return;
    setLoading(true);
    api.get<Slots>(`${slotsPath}?day=${day}`).then(setSlots).catch(() => setSlots({ day, duration_min: 60, slots: [] })).finally(() => setLoading(false));
  }, [day, slotsPath]);

  const groups = (slots?.slots ?? []).reduce<Record<string, string[]>>((g, t) => {
    const h = Number(t.slice(0, 2));
    const k = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
    (g[k] ??= []).push(t);
    return g;
  }, {});

  return (
    <div className="slotpicker">
      <div className="sp-days" role="group" aria-label="Choose a day">
        {days.map((d, i) => {
          const dt = new Date(d + "T12:00:00+04:00");
          return (
            <button type="button" key={d} aria-pressed={day === d} onClick={() => { setDay(d); onChange(null); }}>
              <span>{i === 0 && d === todayUAE() ? "Today" : dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Dubai" })}</span>
              <b>{dt.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Asia/Dubai" })}</b>
              <small>{dt.toLocaleDateString("en-GB", { month: "short", timeZone: "Asia/Dubai" })}</small>
            </button>
          );
        })}
      </div>
      {day && (
        loading ? <p className="sp-note">Checking free times…</p>
          : !slots?.slots.length ? <p className="sp-note">No free times that day. Try another day.</p>
          : (
            <div className="sp-slots">
              {Object.entries(groups).map(([label, ts]) => (
                <div key={label}>
                  <span className="sp-label">{label}</span>
                  <div className="sp-times" role="group" aria-label={`${label} times`}>
                    {ts.map((t) => <button type="button" key={t} aria-pressed={value?.day === day && value?.time === t} onClick={() => onChange({ day, time: t })}>{ampm(t)}</button>)}
                  </div>
                </div>
              ))}
            </div>
          )
      )}
    </div>
  );
}

export { ampm };
