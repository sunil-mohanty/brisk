"use client";

import Link from "next/link";
import { useSession } from "@/components/session";
import { helpLink } from "@/lib/site";

/** The three steps of each path, shown on the cards so owners see the whole journey at a glance. */
export function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="qc-steps">
      {steps.map((s, i) => <li key={s}><span>{i + 1}</span>{s}</li>)}
    </ol>
  );
}

/** Numbered section used inside the New quote / New campaign flows. */
export function StepCard({ n, title, sub, children, done }: { n: number; title: string; sub?: React.ReactNode; children: React.ReactNode; done?: boolean }) {
  return (
    <section className={`card qc-step${done ? " is-done" : ""}`} aria-labelledby={`step-${n}`}>
      <header className="qc-step-h">
        <span className="qc-num" aria-hidden="true">{done ? "✓" : n}</span>
        <div><h2 id={`step-${n}`}>{title}</h2>{sub && <p>{sub}</p>}</div>
      </header>
      {children}
    </section>
  );
}

export function useCampaignsOn() {
  const { business } = useSession();
  return business.campaigns_enabled !== false;
}

/** Shown wherever Campaigns would be when the add-on isn't switched on for this business. */
export function AddonGate({ compact }: { compact?: boolean }) {
  const { business } = useSession();
  const ask = helpLink(`Hi, I'd like to switch on the Campaigns add-on for ${business.name}.`);
  return (
    <div className={`addon-gate${compact ? " compact" : ""}`}>
      <span className="addon-badge">Add-on</span>
      <h3>Campaigns</h3>
      <p>Turn one offer into posts on <b>Facebook</b> and <b>Instagram</b>, a <b>WhatsApp message to a whole client group</b>, and a link & QR code for ads and posters. See who opened it, accepted and booked.</p>
      <div className="acts" style={{ justifyContent: "flex-start" }}>
        {ask ? <a className="btn primary" href={ask} target="_blank" rel="noreferrer">Ask to switch it on</a> : <span className="muted small">Ask us to switch it on for your account.</span>}
        {!compact && <Link className="btn" href="/quotes?tab=quotes">Back to quotes</Link>}
      </div>
    </div>
  );
}

const G = { viewBox: "0 0 24 24", width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
/** Plain generic icons for each channel (the channel name is always written next to them). */
export const ChannelIcon = {
  facebook: () => <svg {...G}><rect x="3.5" y="4" width="17" height="16" rx="3" /><path d="M7 9h10M7 13h6M7 16.5h8" /></svg>,
  instagram: () => <svg {...G}><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.5-2h4l1.5 2h2A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="12" cy="12.5" r="3.5" /></svg>,
  whatsapp: () => <svg {...G}><path d="M4 18.5V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3H8z" /><path d="M8.5 9h7M8.5 12.5h4.5" /></svg>,
  link: () => <svg {...G}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>,
};
