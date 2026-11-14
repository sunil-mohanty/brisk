"use client";

import Link from "next/link";
import { useState } from "react";
import { Lightbox } from "@/components/QuotePicture";
import { useSession } from "@/components/session";
import { money } from "@/lib/format";
import type { Campaign } from "@/lib/types";
import { useWhatsApp } from "@/lib/whatsapp";

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/**
 * How the campaign looks where it goes: a social post, a WhatsApp message, or the offer link.
 * Always shows the salon's name, the way clients will see it.
 */
export function CampaignPreview({ c, as = "post", editHref, onEdit, compact }: {
  c: Campaign; as?: "post" | "whatsapp" | "link"; editHref?: string; onEdit?: () => void; compact?: boolean;
}) {
  const { business } = useSession();
  const [big, setBig] = useState(false);
  const img = `/api/public/c/${c.token}/image/portrait.jpg?v=${c.image_version}`;
  const name = business.name;
  const edit = editHref ? <Link className="btn sm" href={editHref}>✎ Edit campaign</Link>
    : onEdit ? <button type="button" className="btn sm" onClick={onEdit}>✎ Edit</button> : null;
  const picture = (
    <button type="button" className="cprev-img" onClick={() => setBig(true)} aria-label="See the picture full size">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt={`${c.title} at ${name}`} />
    </button>
  );
  const msg = c.wa_message.replace("{name}", "Sara").split(/(https?:\/\/\S+)/);
  const wa = useWhatsApp();
  const api = !!wa?.campaigns; // sent from the WhatsApp Business number, with booking buttons
  const ends = c.valid_until ? `ends ${new Date(c.valid_until + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "limited time";

  return (
    <div className={`cprev as-${as}${compact ? " compact" : ""}`}>
      <div className="cprev-top">
        <span className="cprev-label">{as === "post" ? "Preview · Facebook & Instagram" : as === "whatsapp" ? "Preview · WhatsApp message" : "Preview · Offer link"}</span>
        {edit}
      </div>

      {as === "post" && (
        <div className="cprev-card">
          <div className="cprev-who">
            <span className="cprev-av">{initials(name)}</span>
            <span><b>{name}</b><small>Sponsored · just now</small></span>
          </div>
          {!compact && <p className="cprev-cap">{c.headline ? <b>{c.headline} </b> : null}{c.title}. {money(c.totals.total, business.currency)}{c.valid_until ? ", for a limited time" : ""}. Tap to accept and book.</p>}
          {picture}
          <div className="cprev-cta"><span>{c.public_url.replace(/^https?:\/\//, "").split("/")[0]}</span><b>Book now</b></div>
        </div>
      )}

      {as === "whatsapp" && (
        <div className="cprev-wa">
          <div className="cprev-wa-bar"><span className="cprev-av">{initials(name)}</span><b>{name}</b></div>
          <div className="cprev-wa-chat">
            {api ? (
              <div className="cprev-tpl">
                <div className="cprev-bubble in">
                  <button type="button" className="cprev-img sq" onClick={() => setBig(true)} aria-label="See the picture full size">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/public/c/${c.token}/image/square.jpg?v=${c.image_version}`} alt={`${c.title} at ${name}`} />
                  </button>
                  <p>Hi Sara! {c.headline || "Something special for you."}{"\n\n"}{name} has a special offer for you: {c.title} for {money(c.totals.total, business.currency)} ({ends}).{"\n\n"}Tap Accept &amp; book to choose your time right here in WhatsApp.</p>
                  <time>now</time>
                </div>
                <div className="cprev-btns">
                  <span>Accept &amp; book</span><span>Not interested</span><span>Stop offers</span>
                </div>
                <div className="cprev-bubble out"><p>Accept &amp; book</p><time>now ✓✓</time></div>
                <div className="cprev-bubble in"><p>Wonderful! &quot;{c.title}&quot; at {name} is yours ✅ Now choose a day for your visit.</p>
                  <span className="cprev-list">☰ Choose a day</span></div>
              </div>
            ) : (
            <div className="cprev-bubble">
              <div className="cprev-wa-link">
                {picture}
                <span><b>{c.title}</b><small>{c.headline || name}</small></span>
              </div>
              <p>{msg.map((part, i) => /^https?:/.test(part) ? <u key={i}>{part}</u> : <span key={i}>{part}</span>)}</p>
              <time>now ✓✓</time>
            </div>
            )}
          </div>
          <p className="small muted cprev-note">{api
            ? "Each client sees their own first name. They tap Accept & book, pick a day and a time, and get the confirmation, all inside WhatsApp."
            : "Each client sees their own first name. The link opens the offer, where they accept and book."}</p>
        </div>
      )}

      {as === "link" && (
        <div className="cprev-card">
          {picture}
          <div className="cprev-link">
            <small>{name}</small>
            <b>{c.headline || c.title}</b>
            <span className="mono small">{c.public_url.replace(/^https?:\/\//, "")}</span>
          </div>
          <a className="btn sm" href={`/c/${c.token}?preview=1`} target="_blank" rel="noreferrer" style={{ margin: "0 12px 12px" }}>Open the offer page</a>
        </div>
      )}
      {big && <Lightbox src={img} alt={`${c.title} at ${name}`} onClose={() => setBig(false)} />}
    </div>
  );
}
