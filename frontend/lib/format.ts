export const money = (v: string | number, cur = "AED") =>
  `${cur} ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const asDate = (iso: string) => (iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso));

export const fmtDate = (iso: string) =>
  asDate(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const daysUntil = (iso: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((asDate(iso).getTime() - today.getTime()) / 86400000);
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** wa.me link for a customer phone. Local UAE numbers (05x...) get +971. */
export function waLink(phone: string | null | undefined, text: string) {
  if (!phone) return `https://wa.me/?text=${encodeURIComponent(text)}`;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "971" + d.slice(1);
  else if (d.length <= 9) d = "971" + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

/* ---------- salon times: always shown in UAE time, whatever the device clock says ---------- */
export const TZ = "Asia/Dubai";
export const OFFSET = "+04:00";

/** "2026-10-25" for an ISO instant, in UAE. */
export const uaeDate = (iso: string | Date) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
/** "16:30" for an ISO instant, in UAE. */
export const uaeTime = (iso: string | Date) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
/** Minutes since midnight (UAE). */
export const uaeMinutes = (iso: string | Date) => { const [h, m] = uaeTime(iso).split(":").map(Number); return h * 60 + m; };
/** "4:30 pm" */
export const fmtTime = (iso: string | Date) => new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", " ");
/** "Sat 25 Oct" */
export const fmtDay = (isoDate: string) => new Date(isoDate + "T12:00:00" + OFFSET).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
export const fmtDayLong = (isoDate: string) => new Date(isoDate + "T12:00:00" + OFFSET).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
export const todayUAE = () => uaeDate(new Date());
export const addDays = (isoDate: string, n: number) => { const d = new Date(isoDate + "T12:00:00" + OFFSET); d.setUTCDate(d.getUTCDate() + n); return uaeDate(d); };
/** ISO instant for a UAE date + "HH:MM". */
export const atUAE = (isoDate: string, hhmm: string) => `${isoDate}T${hhmm}:00${OFFSET}`;
