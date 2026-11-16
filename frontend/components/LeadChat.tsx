"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useSession } from "@/components/session";
import { api } from "@/lib/api";
import { fmtDateTime, fmtTime, waLink } from "@/lib/format";
import type { Chat, Lead } from "@/lib/types";
import { waWhy } from "@/lib/whatsapp";

const WHO: Record<string, string> = {
  auto_reply: "Automatic reply", bot: "Brisk", campaign: "Campaign", quote: "Quote", booking_confirmed: "Booking confirmation", chat: "",
};
const TICK: Record<string, string> = { sent: "✓", delivered: "✓✓", read: "✓✓", manual: "", failed: "!" };

/** The WhatsApp conversation with a lead's client: read what they wrote, reply from the Business number. */
export function LeadChat({ lead, onClose, onChanged }: { lead: Lead | null; onClose: () => void; onChanged: () => void }) {
  const { business } = useSession();
  const [chat, setChat] = useState<Chat | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const id = lead?.id;

  const load = useCallback(() => {
    if (!id) return;
    api.get<Chat>(`/leads/${id}/chat`).then((c) => { setChat(c); window.dispatchEvent(new Event("brisk:chat-read")); }).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    setChat(null); setText(""); setError(null);
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
      setChat(await api.post<Chat>(`/leads/${id}/chat`, { text: body }));
      setText("");
      onChanged();
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  const first = lead?.customer.name.split(" ")[0] ?? "";
  const ends = chat?.window_ends_at ? new Date(chat.window_ends_at) : null;
  const hoursLeft = ends ? Math.max(0, Math.round((ends.getTime() - Date.now()) / 36e5)) : 0;

  return (
    <Sheet open={!!lead} onClose={() => { onClose(); onChanged(); }}>
      {lead && (
        <div className="chat">
          <header className="chat-h">
            <span className="chat-av" aria-hidden="true">{(lead.customer.name.trim()[0] || "?").toUpperCase()}</span>
            <div><h2>{lead.customer.name}</h2><span className="mono small muted">{lead.customer.phone}</span></div>
            {lead.customer.phone && <a className="btn sm" href={`tel:${lead.customer.phone.replace(/\s+/g, "")}`}>Call</a>}
            <button type="button" className="tpl-x" aria-label="Close" onClick={() => { onClose(); onChanged(); }}>×</button>
          </header>

          <div className="chat-body" aria-live="polite">
            {!chat ? <div className="empty">Loading the conversation…</div>
              : !chat.messages.length ? <div className="empty">No WhatsApp messages with {first} yet.</div>
              : chat.messages.map((m, i) => {
                const day = new Date(m.at).toDateString();
                const newDay = i === 0 || new Date(chat.messages[i - 1].at).toDateString() !== day;
                return (
                  <div key={m.id}>
                    {newDay && <div className="chat-day">{fmtDateTime(m.at).split(",")[0]}</div>}
                    <div className={`chat-msg ${m.dir}${m.status === "failed" ? " failed" : ""}`}>
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

          {chat && (!chat.connected ? (
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
          {error && !chat?.can_reply && <p className="chat-err" role="alert">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}

