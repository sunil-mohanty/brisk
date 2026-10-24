"use client";

import { useEffect, useState } from "react";
import { cap } from "@/lib/format";
import type { Quote } from "@/lib/types";

/* ---------- toast: call toast("Saved") from anywhere ---------- */
let push: ((m: string) => void) | null = null;
export const toast = (m: string) => push?.(m);

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    push = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2400);
    };
    return () => {
      push = null;
      clearTimeout(t);
    };
  }, []);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function Pill({ status, label }: { status: string; label?: string }) {
  return <span className={`pill p-${status}`}>{label ?? cap(status)}</span>;
}

/** Quote status as the owner should read it: a new quote is "Ready to send" until it's sent. */
export function QuotePill({ q }: { q: Pick<Quote, "status" | "expired" | "shared_at" | "view_count"> & Partial<Pick<Quote, "booking_status">> }) {
  if (q.status === "accepted" && q.booking_status === "confirmed") return <Pill status="accepted" label="Accepted · Booked" />;
  if (q.status === "accepted" && q.booking_status === "awaiting") return <Pill status="soon" label="Accepted · Awaiting booking" />;
  if (q.expired) return <Pill status="expired" />;
  if (q.status === "sent" && !q.shared_at && !q.view_count) return <Pill status="ready" label="Ready to send" />;
  return <Pill status={q.status} />;
}

/** The header bar at the top of each page: title, a pill (date or context), and the page's actions. */
export function PageHead({ eyebrow, title, sub, action }: { eyebrow?: React.ReactNode; title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="head">
      <div className="head-l">
        <div className="head-t">
          <h1>{title}</h1>
          {eyebrow && <span className="head-pill">{eyebrow}</span>}
        </div>
        {sub && <p>{sub}</p>}
      </div>
      {action && <div className="head-a">{action}</div>}
    </header>
  );
}

export function Loading() {
  return <div className="empty">Loading…</div>;
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <div className="error" role="alert">{error}</div> : null;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Link copied");
  } catch {
    toast("Couldn't copy. Select the link and copy it manually.");
  }
}
