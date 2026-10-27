"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Audience, Categories } from "@/lib/types";

/** The owner's categories (at most 4) with client counts, shared by the Clients page, import and the campaign send panel. */
export function useCategories(): [Categories | null, (c: Categories) => void] {
  const [cats, setCats] = useState<Categories | null>(null);
  useEffect(() => { api.get<Categories>("/customers/categories").then(setCats).catch(() => setCats({ categories: [], uncategorised: 0, max: 4 })); }, []);
  return [cats, setCats];
}

export function TagChips({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return <span className="tagchips">{tags.map((t) => <span className="tagchip" key={t}>{t}</span>)}</span>;
}

/** One client's categories as on/off buttons. */
export function CategoryToggles({ all, on, onChange, onDone }: { all: string[]; on: string[]; onChange: (next: string[]) => void; onDone: () => void }) {
  const has = (c: string) => on.some((t) => t.toLowerCase() === c.toLowerCase());
  return (
    <span className="cattoggles">
      {all.map((c) => (
        <button type="button" key={c} className={`cattoggle${has(c) ? " on" : ""}`} aria-pressed={has(c)}
          onClick={() => onChange(has(c) ? on.filter((t) => t.toLowerCase() !== c.toLowerCase()) : [...on, c])}>
          {has(c) ? "✓ " : "+ "}{c}
        </button>
      ))}
      <button type="button" className="btn sm ghost" onClick={onDone}>Done</button>
    </span>
  );
}

/** Name your own categories, up to the limit. Renaming keeps the clients in it; removing takes it off them. */
export function CategoryManager({ cats, onSaved, onClose }: { cats: Categories; onSaved: (c: Categories) => void; onClose: () => void }) {
  const [rows, setRows] = useState(cats.categories.map((c) => ({ name: c.name, was: c.name as string | null, count: c.count })));
  const [busy, setBusy] = useState(false);
  const set = (i: number, name: string) => setRows((r) => r.map((x, n) => n === i ? { ...x, name } : x));
  const removing = rows.filter((r) => !r.name.trim() && r.was && r.count > 0);
  async function save() {
    const keep = rows.filter((r) => r.name.trim());
    if (removing.length && !window.confirm(`Remove ${removing.map((r) => `“${r.was}”`).join(", ")}? The clients stay, they just leave this category.`)) return;
    setBusy(true);
    try {
      onSaved(await api.put<Categories>("/customers/categories", { categories: keep.map((r) => ({ name: r.name.trim(), was: r.was })) }));
      toast("Categories saved");
      onClose();
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  return (
    <section className="panel catman" aria-label="Manage categories">
      <h2>Your client categories <span className="muted small">up to {cats.max}</span></h2>
      <p className="small muted" style={{ margin: "0 0 12px" }}>Name them your way, e.g. Bridal, VIP, Keratin, Corporate. Renaming keeps everyone in it. Clear a name to remove that category.</p>
      <div className="catman-rows">
        {rows.map((r, i) => (
          <label key={i} className="catman-row">
            <span className="catman-n">{i + 1}</span>
            <input value={r.name} maxLength={30} placeholder="Category name" onChange={(e) => set(i, e.target.value)} />
            {r.was && <span className="small muted">{r.count} client{r.count === 1 ? "" : "s"}</span>}
          </label>
        ))}
      </div>
      <div className="acts" style={{ justifyContent: "flex-start", marginTop: 12 }}>
        {rows.length < cats.max && <button type="button" className="btn sm" onClick={() => setRows((r) => [...r, { name: "", was: null, count: 0 }])}>+ Add category</button>}
        <button type="button" className="btn sm primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save categories"}</button>
        <button type="button" className="btn sm ghost" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}

/** On a campaign: pick a segment and send the offer to each client from your own WhatsApp, one tap each. */
export function SendToClients({ campaignId, initialTag, onSent }: { campaignId: number; initialTag?: string | null; onSent?: (n: number) => void }) {
  const [cats] = useCategories();
  const tags = cats?.categories;
  const [tag, setTag] = useState<string>(initialTag ?? "");
  const [aud, setAud] = useState<Audience | null>(null);
  const [showSent, setShowSent] = useState(false);
  useEffect(() => { if (initialTag) document.getElementById("send")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [initialTag]);

  useEffect(() => {
    setAud(null);
    api.get<Audience>(`/campaigns/${campaignId}/audience${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`).then(setAud).catch((e) => toast(e.message));
  }, [campaignId, tag]);

  async function send(id: number, url: string) {
    window.open(url, "_blank", "noopener");
    setAud((a) => a && { ...a, sent: a.sent + 1, rows: a.rows.map((r) => r.customer_id === id ? { ...r, sent_at: new Date().toISOString() } : r) });
    try { await api.post(`/campaigns/${campaignId}/audience/${id}/sent`); onSent?.(1); } catch { /* the tick is only a reminder */ }
  }
  async function undo(id: number) {
    setAud((a) => a && { ...a, sent: Math.max(0, a.sent - 1), rows: a.rows.map((r) => r.customer_id === id ? { ...r, sent_at: null } : r) });
    try { await api.del(`/campaigns/${campaignId}/audience/${id}/sent`); onSent?.(-1); } catch { /* ignore */ }
  }

  const reachable = aud?.rows.filter((r) => r.whatsapp_url) ?? [];
  const left = reachable.filter((r) => !r.sent_at);
  const shown = aud ? (showSent ? aud.rows : aud.rows.filter((r) => !r.sent_at)) : [];
  const next = left[0];

  return (
    <section className="panel sendlist" id="send">
      <h2>Send to your clients on WhatsApp <span className="muted small">from your own number</span></h2>
      <div className="seg-pick">
        <label>Who
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All clients</option>
            {(tags ?? []).map((t) => <option key={t.name} value={t.name}>{t.name} ({t.count})</option>)}
            {tag && tags && !tags.some((t) => t.name.toLowerCase() === tag.toLowerCase()) && <option value={tag}>{tag}</option>}
          </select>
        </label>
        {aud && (
          <div className="seg-progress" aria-live="polite">
            <b>{reachable.length - left.length} of {reachable.length} sent</b>
            <span className="bar"><i style={{ width: `${reachable.length ? ((reachable.length - left.length) / reachable.length) * 100 : 0}%` }} /></span>
          </div>
        )}
      </div>
      {!aud ? <div className="empty">Loading clients…</div> : aud.rows.length === 0 ? (
        <div className="empty">{tag ? <>No clients in “{tag}” yet. Add clients to it on the <a href="/customers">Clients</a> page.</> : <>No clients yet. <a href="/customers/import">Import your clients</a> first.</>}</div>
      ) : (
        <>
          {next && (
            <div className="acts" style={{ justifyContent: "flex-start", marginBottom: 10 }}>
              <button className="btn wa" onClick={() => send(next.customer_id, next.whatsapp_url!)}>Send to next: {next.name}</button>
              <span className="small muted">Opens WhatsApp with the message ready. Press send there, then come back for the next one.</span>
            </div>
          )}
          {!next && reachable.length > 0 && <div className="banner ok" style={{ marginBottom: 10 }}>Sent to everyone{tag ? ` in “${tag}”` : ""} with a mobile number.</div>}
          <div className="list">
            {shown.map((r) => (
              <div className={`row${r.sent_at ? " is-sent" : ""}`} key={r.customer_id}>
                <div className="l"><b>{r.name}</b><div className="mono">{r.phone || "no mobile number"}</div></div>
                <div className="acts" style={{ flexWrap: "nowrap" }}>
                  {r.sent_at
                    ? <><span className="sent-ok">✓ Sent</span><button className="btn sm ghost" onClick={() => undo(r.customer_id)}>Undo</button></>
                    : r.whatsapp_url
                      ? <button className="btn sm wa" onClick={() => send(r.customer_id, r.whatsapp_url!)}>Send</button>
                      : <span className="small muted">Can&apos;t send</span>}
                </div>
              </div>
            ))}
          </div>
          {aud.sent > 0 && (
            <button type="button" className="linkbtn small" onClick={() => setShowSent(!showSent)}>
              {showSent ? "Hide the ones already sent" : `Show the ${aud.sent} already sent`}
            </button>
          )}
          <p className="note" style={{ margin: "10px 0 0" }}>Each message starts with the client&apos;s first name and ends with the offer link, so WhatsApp shows the offer picture.</p>
        </>
      )}
    </section>
  );
}
