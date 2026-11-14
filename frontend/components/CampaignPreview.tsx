"use client";

import Link from "next/link";
import { useState } from "react";
import { Lightbox } from "@/components/QuotePicture";
import { useSession } from "@/components/session";
import { money } from "@/lib/format";
import type { Campaign } from "@/lib/types";

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
            <div className="cprev-bubble">
              <div className="cprev-wa-link">
                {picture}
                <span><b>{c.title}</b><small>{c.headline || name}</small></span>
              </div>
              <p>{msg.map((part, i) => /^https?:/.test(part) ? <u key={i}>{part}</u> : <span key={i}>{part}</span>)}</p>
              <time>now ✓✓</time>
            </div>
          </div>
          <p className="small muted cprev-note">Each client sees their own first name. The link opens the offer, where they accept and book.</p>
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
