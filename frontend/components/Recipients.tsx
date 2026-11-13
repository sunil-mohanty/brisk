"use client";

import { useEffect, useMemo, useState } from "react";
import { useCategories } from "@/components/Segments";
import { toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { CustomerSummary } from "@/lib/types";

export interface NewClient { key: string; name: string; phone: string }
export interface Chosen { ids: Set<number>; fresh: NewClient[] }

const digits = (s: string) => s.replace(/\D/g, "");

/** Who gets the quote: tick clients from the address book, add a whole category, or add a brand-new client. */
export function Recipients({ value, onChange, preselect }: { value: Chosen; onChange: (c: Chosen) => void; preselect?: { customer?: number; category?: string } }) {
  const [clients, setClients] = useState<CustomerSummary[] | null>(null);
  const [cats] = useCategories();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => { api.get<CustomerSummary[]>("/customers").then(setClients).catch(() => setClients([])); }, []);

  const withPhone = useMemo(() => (clients ?? []).filter((c) => c.phone), [clients]);
  const byId = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c])), [clients]);

  // Arriving from a client or a category (e.g. "Send a quote to Bridal")
  useEffect(() => {
    if (!clients || !preselect) return;
    const ids = new Set(value.ids);
    if (preselect.customer && byId.has(preselect.customer)) ids.add(preselect.customer);
    if (preselect.category) withPhone.filter((c) => c.tags.some((t) => t.toLowerCase() === preselect.category!.toLowerCase())).forEach((c) => ids.add(c.id));
    if (ids.size !== value.ids.size) onChange({ ...value, ids });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  const t = q.trim().toLowerCase();
  const shown = withPhone.filter((c) => !t || c.name.toLowerCase().includes(t) || (digits(t) && digits(c.phone ?? "").includes(digits(t))));
  const toggle = (id: number) => { const ids = new Set(value.ids); if (ids.has(id)) ids.delete(id); else ids.add(id); onChange({ ...value, ids }); };
  const addCategory = (cat: string) => {
    const ids = new Set(value.ids);
    const inCat = withPhone.filter((c) => c.tags.some((x) => x.toLowerCase() === cat.toLowerCase()));
    inCat.forEach((c) => ids.add(c.id));
    onChange({ ...value, ids });
    toast(`${inCat.length} client${inCat.length === 1 ? "" : "s"} from ${cat} added`);
  };
  const allShown = shown.length > 0 && shown.every((c) => value.ids.has(c.id));
  const toggleShown = () => { const ids = new Set(value.ids); shown.forEach((c) => (allShown ? ids.delete(c.id) : ids.add(c.id))); onChange({ ...value, ids }); };

  function addNew(e?: React.FormEvent) {
    e?.preventDefault();
    const n = name.trim(), p = phone.trim();
    if (!n) return toast("Type the client's name.");
    if (digits(p).length < 7) return toast("Type the client's mobile number, so the quote can go on WhatsApp.");
    const same = withPhone.find((c) => digits(c.phone ?? "").endsWith(digits(p).slice(-9)));
    if (same) { toggle(same.id); toast(`${same.name} is already in your clients, so we picked them.`); }
    else onChange({ ...value, fresh: [...value.fresh, { key: `${Date.now()}`, name: n, phone: p }] });
    setName(""); setPhone(""); setAdding(false);
  }

  const count = value.ids.size + value.fresh.length;
  return (
    <div className="rcp">
      <div className="rcp-chosen" aria-live="polite">
        {count === 0 ? <span className="muted">Nobody chosen yet. Tick clients below, add a whole category, or add a new client.</span> : <>
          {[...value.ids].slice(0, 30).map((id) => byId.get(id) && (
            <span className="rcp-chip" key={id}>{byId.get(id)!.name}<button type="button" aria-label={`Remove ${byId.get(id)!.name}`} onClick={() => toggle(id)}>×</button></span>
          ))}
          {value.ids.size > 30 && <span className="rcp-chip more">+{value.ids.size - 30} more</span>}
          {value.fresh.map((n) => (
            <span className="rcp-chip new" key={n.key}>{n.name} <small>new</small><button type="button" aria-label={`Remove ${n.name}`} onClick={() => onChange({ ...value, fresh: value.fresh.filter((x) => x.key !== n.key) })}>×</button></span>
          ))}
          <button type="button" className="linkbtn small" onClick={() => onChange({ ids: new Set(), fresh: [] })}>Clear all</button>
        </>}
      </div>

      <div className="rcp-tools">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your clients by name or mobile" aria-label="Search clients" />
        <button type="button" className="btn" onClick={() => setAdding(!adding)}>+ New client</button>
      </div>
      {adding && (
        <form className="rcp-new" onSubmit={addNew}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" aria-label="New client name" maxLength={120} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile, e.g. 050 123 4567" aria-label="New client mobile" inputMode="tel" maxLength={40} />
          <button className="btn primary">Add</button>
          <span className="hint">They&apos;re saved to your clients when you create the quote.</span>
        </form>
      )}
      {!!cats?.categories.length && (
        <div className="rcp-cats">
          <span className="small muted">Add a whole category:</span>
          {cats.categories.map((c) => <button type="button" key={c.name} className="chip" disabled={!c.count} onClick={() => addCategory(c.name)}>+ {c.name} <span className="mono">{c.count}</span></button>)}
        </div>
      )}

      {!clients ? <div className="empty">Loading your clients…</div> : withPhone.length === 0 ? (
        <div className="empty">No clients with a mobile number yet. Add a new client above, or import your contacts on the Clients page.</div>
      ) : (
        <>
          <div className="rcp-list" role="group" aria-label="Your clients">
            {shown.slice(0, 200).map((c) => (
              <label key={c.id} className={value.ids.has(c.id) ? "on" : undefined}>
                <input type="checkbox" checked={value.ids.has(c.id)} onChange={() => toggle(c.id)} />
                <span className="rcp-name">{c.name}{c.tags.length > 0 && <small>{c.tags.join(" · ")}</small>}</span>
                <span className="rcp-phone mono">{c.phone}</span>
              </label>
            ))}
            {!shown.length && <div className="empty">No clients match “{q}”. <button type="button" className="linkbtn" onClick={() => { setAdding(true); setName(q); }}>Add as a new client</button></div>}
          </div>
          <div className="rcp-foot">
            <span className="small muted">{shown.length > 200 ? `Showing 200 of ${shown.length}. Search to narrow down.` : `${shown.length} client${shown.length === 1 ? "" : "s"}`}</span>
            {shown.length > 1 && <button type="button" className="linkbtn small" onClick={toggleShown}>{allShown ? "Untick these" : `Tick all ${Math.min(shown.length, 500)}`}</button>}
          </div>
        </>
      )}
    </div>
  );
}
