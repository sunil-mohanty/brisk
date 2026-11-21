"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useSession } from "@/components/session";
import { api } from "@/lib/api";
import { fmtDateTime, fmtTime, waLink } from "@/lib/format";
import type { Chat, ChatChannelId, Lead } from "@/lib/types";
import { waWhy } from "@/lib/whatsapp";

const WHO: Record<string, string> = {
  auto_reply: "Automatic reply", private_reply: "Private reply", public_reply: "Public reply under their comment", bot: "Brisk", campaign: "Campaign", quote: "Quote", booking_confirmed: "Booking confirmation", chat: "",
};
const TICK: Record<string, string> = { sent: "✓", delivered: "✓✓", read: "✓✓", manual: "", failed: "!" };
const NAME: Record<ChatChannelId, string> = { whatsapp: "WhatsApp", facebook: "Facebook", instagram: "Instagram" };
const META_INBOX = "https://business.facebook.com/latest/inbox";

/** The conversation with a lead's client on WhatsApp, Facebook and Instagram: read what they wrote and reply. */
export function LeadChat({ lead, onClose, onChanged }: { lead: Lead | null; onClose: () => void; onChanged: () => void }) {
  const { business } = useSession();
  const [chat, setChat] = useState<Chat | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ch, setCh] = useState<ChatChannelId | null>(null); // where the reply goes
  const [pub, setPub] = useState(false); // facebook / instagram: answer under their comment, for everyone to see
  const end = useRef<HTMLDivElement>(null);
  const id = lead?.id;

  const load = useCallback(() => {
    if (!id) return;
    api.get<Chat>(`/leads/${id}/chat`).then((c) => { setChat(c); window.dispatchEvent(new Event("brisk:chat-read")); }).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    setChat(null); setText(""); setError(null); setCh(null); setPub(false);
    if (!id) return;
    load();
    const t = setInterval(load, 6000); // new messages from the client show up by themselves
    return () => clearInterval(t);
  }, [id, load]);
  const count = chat?.messages.length ?? 0;
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [count]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !id) return;
    setBusy(true); setError(null);
    try {
      setChat(await api.post<Chat>(`/leads/${id}/chat`, { text: body, channel: chan, public: !!social && isPublic }));
      setText("");
      onChanged();
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  const first = (lead?.customer.name.split(" ")[0] ?? "").replace(/^@/, "");
  const chan: ChatChannelId = ch ?? chat?.channel ?? "whatsapp";
  const social = chat?.channels.find((c) => c.channel === chan && c.channel !== "whatsapp");
  const several = (chat?.channels.length ?? 0) > 1;
  const isPublic = !!social && (pub || !social.can_reply) && social.can_public; // only public is left once the private message is used
  const ends = chat?.window_ends_at ? new Date(chat.window_ends_at) : null;
  const hoursLeft = ends ? Math.max(0, Math.round((ends.getTime() - Date.now()) / 36e5)) : 0;

  return (
    <Sheet open={!!lead} onClose={() => { onClose(); onChanged(); }}>
      {lead && (
        <div className="chat">
          <header className="chat-h">
            <span className="chat-av" aria-hidden="true">{(lead.customer.name.trim()[0] || "?").toUpperCase()}</span>
            <div><h2>{lead.customer.name}</h2><span className="mono small muted">{lead.customer.phone || (lead.channel && lead.channel !== "whatsapp" ? `${NAME[lead.channel]}${lead.social?.startsWith("@") && lead.social !== lead.customer.name ? ` ${lead.social}` : ""}` : "")}</span></div>
            {lead.customer.phone && <a className="btn sm" href={`tel:${lead.customer.phone.replace(/\s+/g, "")}`}>Call</a>}
            <button type="button" className="tpl-x" aria-label="Close" onClick={() => { onClose(); onChanged(); }}>×</button>
          </header>

          {several && chat && (
            <div className="chat-chan" role="group" aria-label="Reply on">
              <span className="small muted" style={{ alignSelf: "center" }}>Reply on</span>
              {chat.channels.map((c) => (
                <button type="button" key={c.channel} className={c.channel} aria-pressed={c.channel === chan} onClick={() => setCh(c.channel)}>{c.label}</button>
              ))}
            </div>
          )}

          <div className="chat-body" aria-live="polite">
            {!chat ? <div className="empty">Loading the conversation…</div>
              : !chat.messages.length ? <div className="empty">No messages with {first} yet.</div>
              : chat.messages.map((m, i) => {
                const day = new Date(m.at).toDateString();
                const newDay = i === 0 || new Date(chat.messages[i - 1].at).toDateString() !== day;
                return (
                  <div key={m.id}>
                    {newDay && <div className="chat-day">{fmtDateTime(m.at).split(",")[0]}</div>}
                    <div className={`chat-msg ${m.dir} ch-${m.channel}${m.status === "failed" ? " failed" : ""}`}>
                      {m.channel !== "whatsapp" && <span className={`chat-src ${m.channel}`}>{NAME[m.channel]}{m.note ? ` · ${m.note}` : ""}</span>}
                      {m.dir === "out" && m.kind && WHO[m.kind] && <span className="chat-who">{WHO[m.kind]}</span>}
                      <p>{m.text}</p>
                      <time>{fmtTime(m.at)} {m.dir === "out" && m.status && <b className={m.status === "read" ? "read" : undefined}>{TICK[m.status] ?? ""}</b>}</time>
                      {m.status === "failed" && <small className="wa-why">{waWhy(m.error)}</small>}
                    </div>
                  </div>
                );
              })}
            <div ref={end} />
          </div>

          {chat && social ? (social.can_reply || social.can_public ? (
            <form className="chat-send" onSubmit={send}>
              {error && <div className="chat-err" role="alert">{error}</div>}
              {social.can_reply && social.can_public && (
                <div className="chat-mode" role="radiogroup" aria-label="How to reply">
                  <button type="button" role="radio" aria-checked={!isPublic} onClick={() => setPub(false)}>Private message</button>
                  <button type="button" role="radio" aria-checked={isPublic} onClick={() => setPub(true)}>Public reply under comment</button>
                </div>
              )}
              <textarea value={text} rows={2} maxLength={1000}
                placeholder={isPublic ? `Reply under ${first}'s comment…` : `Message ${first} on ${NAME[social.channel]}…`}
                aria-label={isPublic ? `Reply under ${first}'s comment` : `Message ${first} on ${NAME[social.channel]}`}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button className="btn primary" disabled={busy || !text.trim()}>{busy ? "Sending…" : isPublic ? "Reply" : "Send"}</button>
              <span className="small muted chat-hint">{isPublic
                ? `${social.can_reply ? "" : `${NAME[social.channel]} allows another private message once ${first} writes back. Meanwhile, `}this shows under their comment${social.comment ? ` “${social.comment.length > 50 ? social.comment.slice(0, 50) + "…" : social.comment}”` : ""} as ${business.name}, where everyone can see it`
                : social.how === "comment"
                ? `Goes as a private message about their comment. ${NAME[social.channel]} allows one, until ${social.until ? fmtDateTime(social.until) : "7 days after the comment"}; if they write back you can keep chatting`
                : `Goes as a ${NAME[social.channel]} message · you can reply until ${social.until ? fmtDateTime(social.until) : "24 hours after theirs"}`} · Enter to send</span>
            </form>
          ) : (
            <div className="chat-off">
              {chat.messages.some((m) => m.channel === social.channel && m.kind === "private_reply" && m.status !== "failed")
                ? `${first} got your private reply on ${NAME[social.channel]}. When they write back, you can keep chatting here for 24 hours.`
                : social.hint ?? `${first} can't be messaged on ${NAME[social.channel]} yet: they only reacted. When they comment or message, you can reply here.`}
              <a className="btn sm" href={META_INBOX} target="_blank" rel="noreferrer">Open Meta inbox</a>
              {lead.customer.phone && <a className="btn sm wa" href={waLink(lead.customer.phone, `Hi ${first}, this is ${business.name}. `)} target="_blank" rel="noreferrer">WhatsApp</a>}
            </div>
          )) : chat && (!chat.connected ? (
            <div className="chat-off">
              The WhatsApp Business number isn&apos;t connected, so replies can&apos;t go from here yet.
              {lead.customer.phone && <a className="btn sm wa" href={waLink(lead.customer.phone, `Hi ${first}, `)} target="_blank" rel="noreferrer">Reply from my phone</a>}
            </div>
          ) : !chat.can_reply ? (
            <div className="chat-off">
              {chat.messages.some((m) => m.dir === "in")
                ? <>It&apos;s been more than 24 hours since {first} last wrote. WhatsApp only allows free replies within 24 hours, so call them or message from your phone.</>
                : <>{first} hasn&apos;t written to your WhatsApp Business number yet. Message them from your phone, or send a quote or campaign.</>}
              {lead.customer.phone && <a className="btn sm wa" href={waLink(lead.customer.phone, `Hi ${first}, this is ${business.name}. `)} target="_blank" rel="noreferrer">Message from my phone</a>}
            </div>
          ) : (
            <form className="chat-send" onSubmit={send}>
              {error && <div className="chat-err" role="alert">{error}</div>}
              <textarea value={text} rows={2} maxLength={4096} placeholder={`Reply to ${first}…`} aria-label={`Reply to ${first}`}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button className="btn primary" disabled={busy || !text.trim()}>{busy ? "Sending…" : "Send"}</button>
              <span className="small muted chat-hint">Goes from your WhatsApp Business number · {hoursLeft > 0 ? `you can reply for ${hoursLeft} more hour${hoursLeft === 1 ? "" : "s"}` : "reply window closing"} · Enter to send, Shift+Enter for a new line</span>
            </form>
          ))}
          {error && !(social ? social.can_reply : chat?.can_reply) && <p className="chat-err" role="alert">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}

