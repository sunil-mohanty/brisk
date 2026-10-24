"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/session";
import { toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { CatalogItem } from "@/lib/types";
import { CATEGORIES, duration, vocab } from "@/lib/vocab";

/** The salon's service menu: used for bookings, quotes and the public link page. */
export function ServiceMenu() {
  const { business } = useSession();
  const v = vocab(business.business_type);
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [f, setF] = useState({ name: "", price: "", minutes: "60", category: "" });
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { api.get<CatalogItem[]>("/catalog").then(setItems).catch(() => setItems([])); }, []);

  const have = new Set((items ?? []).map((i) => i.name.trim().toLowerCase()));
  const ideas = v.menu.filter((s) => !have.has(s.name.toLowerCase()));
  const groups = useMemo(() => {
    const g = new Map<string, CatalogItem[]>();
    (items ?? []).forEach((m) => g.set(m.category || "Other", [...(g.get(m.category || "Other") ?? []), m]));
    return [...g.entries()];
  }, [items]);

  async function addMany(rows: { name: string; unit_price: number; duration_min: number | null; category: string | null }[], msg: string) {
    try { setItems(await api.post<CatalogItem[]>("/catalog", rows)); toast(msg); } catch (err) { toast((err as Error).message); }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || f.price === "") return;
    await addMany([{ name: f.name.trim(), unit_price: Number(f.price), duration_min: Number(f.minutes) || null, category: f.category.trim() || null }], "Added to your menu");
    setF({ ...f, name: "", price: "" });
    nameRef.current?.focus();
  }
  async function save(it: CatalogItem, patch: Partial<CatalogItem>) {
    try {
      const u = await api.patch<CatalogItem>(`/catalog/${it.id}`, patch);
      setItems((xs) => (xs ?? []).map((x) => (x.id === u.id ? u : x)));
    } catch (err) { toast((err as Error).message); }
  }
  async function remove(it: CatalogItem) {
    await api.del(`/catalog/${it.id}`);
    setItems((xs) => (xs ?? []).filter((x) => x.id !== it.id));
  }

  return (
    <section className="panel" id="menu">
      <h2>Service menu <span className="muted small">{items?.length ?? 0} services</span></h2>
      <p className="muted small" style={{ marginTop: -6 }}>Tap these when booking or quoting. Clients see them on your link page.</p>
      {ideas.length > 0 && (
        <div className="pricechips" style={{ marginBottom: 12 }}>
          <span className="small muted">Popular for a {v.label.toLowerCase()}. Tap to add, then set your own price:</span>
          <div className="chips-inline">
            {ideas.map((s) => <button type="button" key={s.name} className="chip" onClick={() => setF({ name: s.name, price: String(s.price), minutes: String(s.minutes || ""), category: s.category })}>+ {s.name}</button>)}
            {(items?.length ?? 0) === 0 && <button type="button" className="chip linkchip" onClick={() => addMany(ideas.map((s) => ({ name: s.name, unit_price: s.price, duration_min: s.minutes || null, category: s.category })), `${ideas.length} services added. Adjust the prices to yours.`)}>Add all {ideas.length}</button>}
          </div>
        </div>
      )}
      <form className="menu-add" onSubmit={add}>
        <input ref={nameRef} id="mn-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={v.itemPlaceholder} aria-label="Service" maxLength={300} />
        <input id="mn-price" type="number" min="0" step="1" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder={`Price (${business.currency})`} aria-label="Price" />
        <input id="mn-min" type="number" min="5" max="720" step="5" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} placeholder="Minutes" aria-label="Minutes" />
        <input id="mn-cat" list="menu-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Category, e.g. Hair" aria-label="Category" maxLength={60} />
        <button className="btn primary" disabled={!f.name.trim() || f.price === ""}>Add</button>
      </form>
      <datalist id="menu-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      {items && items.length === 0 && <p className="muted small" style={{ margin: "12px 0 0" }}>Your menu is empty. Add your services above, or tap the suggestions.</p>}
      {groups.map(([cat, list]) => (
        <div className="menu-group" key={cat}>
          <h3>{cat}</h3>
          {list.map((it) => (
            <div className="menu-row" key={it.id}>
              <input defaultValue={it.name} aria-label="Service name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== it.name && save(it, { name: e.target.value.trim() })} />
              <input defaultValue={Number(it.unit_price)} type="number" min="0" step="1" inputMode="decimal" aria-label={`Price for ${it.name}`} onBlur={(e) => Number(e.target.value) !== Number(it.unit_price) && save(it, { unit_price: String(Number(e.target.value) || 0) })} />
              <input defaultValue={it.duration_min ?? ""} type="number" min="5" max="720" step="5" aria-label={`Minutes for ${it.name}`} placeholder="min" title={duration(it.duration_min)} onBlur={(e) => (Number(e.target.value) || null) !== it.duration_min && save(it, { duration_min: Number(e.target.value) || null })} />
              <span className="tog">
                <label className="check" style={{ display: "inline-flex", fontSize: 13 }}><input type="checkbox" checked={it.price_from} onChange={(e) => save(it, { price_from: e.target.checked })} />“from”</label>{" "}
                <label className="check" style={{ display: "inline-flex", fontSize: 13 }}><input type="checkbox" checked={it.on_page} onChange={(e) => save(it, { on_page: e.target.checked })} />on page</label>
              </span>
              <button type="button" className="btn sm" aria-label={`Remove ${it.name}`} onClick={() => remove(it)}>×</button>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
