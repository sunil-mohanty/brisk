"use client";

import Link from "next/link";
import { useSession } from "@/components/session";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { helpLink, site } from "@/lib/site";
import type { Business, Dashboard } from "@/lib/types";

const STEPS: { key: keyof Dashboard["setup"]; title: string; why: string; href: string; cta: string }[] = [
  { key: "profile", title: "Add your salon details", why: "Your WhatsApp number and area show on every booking confirmation and quote.", href: "/settings", cta: "Add details" },
  { key: "menu", title: "Add your service menu", why: "Prices and times for what you offer. Tap them when booking, and clients see them on your page.", href: "/menu", cta: "Add services" },
  { key: "link", title: "Set up your link page", why: "One link for your Instagram and TikTok bio. Clients see your menu and request a booking.", href: "/link", cta: "Set up" },
  { key: "booked", title: "Book your first client", why: "Send the confirmation on WhatsApp in one tap. Finish the visit and we'll remind you to rebook.", href: "/appointments?new=1", cta: "Book" },
];

/** Getting-started checklist for new salons. Disappears when done or hidden. */
export function Checklist({ setup }: { setup: Dashboard["setup"] }) {
  const { business, setBusiness } = useSession();
  const done = STEPS.filter((s) => setup[s.key]).length;
  if (business.checklist_hidden || done === STEPS.length) return null;
  const next = STEPS.find((s) => !setup[s.key]);
  const help = helpLink(`Hi, I'm setting up ${site.name} and need a hand`);

  const hide = async () => {
    try {
      setBusiness(await api.patch<Business>("/business", { checklist_hidden: true }));
    } catch {
      /* keep showing it */
    }
  };

  return (
    <section className="panel checklist" aria-label="Getting started">
      <div className="ck-head">
        <div>
          <h2>Get your salon set up <span className="muted small">{done} of {STEPS.length} done</span></h2>
          {business.trial_ends_at && <p className="muted small">Your free trial runs until {fmtDate(business.trial_ends_at)}.</p>}
        </div>
        <button className="btn sm" onClick={hide}>Hide</button>
      </div>
      <div className="ck-bar" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={done}><div style={{ width: `${(done / STEPS.length) * 100}%` }} /></div>
      <ol className="ck-steps">
        {STEPS.map((s, i) => {
          const ok = !!setup[s.key];
          return (
            <li key={s.key} className={ok ? "done" : s === next ? "ck-next" : ""}>
              <i aria-hidden="true">{ok ? "✓" : i + 1}</i>
              <div><b>{s.title}</b><span>{s.why}</span></div>
              {!ok && <Link className={`btn sm${s === next ? " primary" : ""}`} href={s.href}>{s.cta}</Link>}
            </li>
          );
        })}
      </ol>
      {help && <p className="muted small" style={{ margin: "10px 0 0" }}>Stuck? <a href={help} target="_blank" rel="noreferrer">Message us on WhatsApp</a> and we'll help you set up.</p>}
    </section>
  );
}
