"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useSession } from "@/components/session";
import { Tip } from "@/components/Tips";
import { ErrorBox, Loading, PageHead, Pill, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime, money } from "@/lib/format";
import type { InventoryItem, StockMove } from "@/lib/types";

const qty = (v: string | number) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
const REASON: Record<string, string> = { received: "Received", used: "Used in salon", sold: "Sold to client", adjust: "Stock count" };

type Mode = { kind: "add" } | { kind: "edit"; item: InventoryItem } | { kind: "move"; item: InventoryItem; reason: "received" | "used" | "sold" | "adjust" } | { kind: "history"; item: InventoryItem } | null;

export default function InventoryPage() {
  const { business } = useSession();
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.swr<InventoryItem[]>("/inventory", setItems).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (items ?? []).filter((i) => (!lowOnly || i.low) && (!q.trim() || `${i.name} ${i.category ?? ""} ${i.sku ?? ""} ${i.supplier ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [items, q, lowOnly]);
  const low = (items ?? []).filter((i) => i.low).length;
  const value = (items ?? []).reduce((s, i) => s + Number(i.stock) * Number(i.cost_price ?? 0), 0);
  const cur = business.currency;

  return (
    <>
      <PageHead
        title="Inventory"
        eyebrow={items ? `${items.length} products` : undefined}
        sub="Colour, developer, retail products and consumables. Record what comes in and what's used, and see what to reorder."
        action={<Tip id="inv.add" order={1} text="Add the products you keep in stock. Set a reorder level to be warned when one runs low."><button className="btn primary" onClick={() => setMode({ kind: "add" })}>+ Add product</button></Tip>}
      />
      <ErrorBox error={error} />
      {items && items.length > 0 && (
        <div className="kpis" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="kpi"><span>Products</span><strong>{items.length}</strong><em>{new Set(items.map((i) => i.category).filter(Boolean)).size} categories</em></div>
          <button type="button" className="kpi kpilink" style={{ textAlign: "left", font: "inherit", cursor: "pointer" }} onClick={() => setLowOnly(!lowOnly)}>
            <span>Running low</span><strong style={{ color: low ? "var(--bad)" : undefined }}>{low}</strong><em>{lowOnly ? "Showing only these. Tap to show all." : "Tap to show only these"}</em>
          </button>
          <div className="kpi"><span>Stock value at cost</span><strong className="money">{money(value, cur)}</strong><em>stock × cost price</em></div>
        </div>
      )}
      <div className="filters">
        <input className="headsearch" style={{ width: 320 }} type="search" placeholder="Search product, category or supplier" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
        <button className="chip" aria-pressed={lowOnly} onClick={() => setLowOnly(!lowOnly)}>Running low {low > 0 && <span className="mono">{low}</span>}</button>
      </div>
      {!items ? <Loading /> : (
        <div className="tablewrap">
          <table className="ctable">
            <thead><tr><th>Product</th><th>Category</th><th className="num">In stock</th><th className="num">Cost</th><th className="num">Sell</th><th>Supplier</th><th /></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td className="c-main"><button type="button" className="linkbtn" style={{ color: "var(--fg)", textDecoration: "none", fontWeight: 600, margin: 0, padding: 0 }} onClick={() => setMode({ kind: "edit", item: i })}>{i.name}</button>{i.sku && <div className="sub">{i.sku}</div>}</td>
                  <td className="c-stat c-first">{i.category ?? "—"}</td>
                  <td className="num c-end"><b>{qty(i.stock)}</b> <span className="sub">{i.unit}</span>{i.low && <div><Pill status="due" label="Reorder" /></div>}</td>
                  <td className="num c-stat" data-label="Cost">{i.cost_price ? money(i.cost_price, cur) : "—"}</td>
                  <td className="num c-stat" data-label="Sell">{i.sell_price ? money(i.sell_price, cur) : "—"}</td>
                  <td className="c-stat c-hide">{i.supplier ?? "—"}</td>
                  <td className="c-acts">
                    <div className="acts" style={{ flexWrap: "nowrap" }}>
                      <button className="btn sm" onClick={() => setMode({ kind: "move", item: i, reason: "received" })}>+ Received</button>
                      <button className="btn sm" onClick={() => setMode({ kind: "move", item: i, reason: "used" })}>− Used</button>
                      {i.sell_price && <button className="btn sm" onClick={() => setMode({ kind: "move", item: i, reason: "sold" })}>− Sold</button>}
                      <button className="btn sm ghost" onClick={() => setMode({ kind: "history", item: i })}>History</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="empty">{items.length ? "No products match." : "No products yet. Add the colour, developer and retail products you keep in stock."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Sheet open={!!mode} onClose={() => setMode(null)}>
        {(mode?.kind === "add" || mode?.kind === "edit") && <ProductForm item={mode.kind === "edit" ? mode.item : undefined} onDone={() => { setMode(null); load(); }} onCancel={() => setMode(null)} />}
        {mode?.kind === "move" && <MoveForm item={mode.item} reason={mode.reason} onDone={(u) => { setItems((xs) => (xs ?? []).map((x) => (x.id === u.id ? u : x))); setMode(null); }} onCancel={() => setMode(null)} />}
        {mode?.kind === "history" && <History item={mode.item} onClose={() => setMode(null)} onCount={() => setMode({ kind: "move", item: mode.item, reason: "adjust" })} />}
      </Sheet>
    </>
  );
}

function ProductForm({ item, onDone, onCancel }: { item?: InventoryItem; onDone: () => void; onCancel: () => void }) {
  const { business } = useSession();
  const [f, setF] = useState({
    name: item?.name ?? "", category: item?.category ?? "", sku: item?.sku ?? "", unit: item?.unit ?? "pcs",
    stock: item ? "" : "0", low_stock: item ? String(Number(item.low_stock)) : "2",
    cost_price: item?.cost_price ? String(Number(item.cost_price)) : "", sell_price: item?.sell_price ? String(Number(item.sell_price)) : "",
    supplier: item?.supplier ?? "", notes: item?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const num = (v: string) => (v === "" ? null : Number(v));
  async function save() {
    if (!f.name.trim()) return setError("Enter the product name.");
    const body = { name: f.name.trim(), category: f.category, sku: f.sku, unit: f.unit || "pcs", low_stock: Number(f.low_stock) || 0,
      cost_price: num(f.cost_price), sell_price: num(f.sell_price), supplier: f.supplier, notes: f.notes || null };
    try {
      if (item) await api.patch(`/inventory/${item.id}`, body);
      else await api.post("/inventory", { ...body, stock: Number(f.stock) || 0 });
      toast(item ? "Product saved" : "Product added");
      onDone();
    } catch (e) { setError((e as Error).message); }
  }
  async function remove() {
    if (!item || !window.confirm(`Delete ${item.name} and its stock history?`)) return;
    await api.del(`/inventory/${item.id}`);
    toast("Product deleted");
    onDone();
  }
  return (
    <>
      <h2>{item ? "Edit product" : "Add product"}</h2>
      <p className="intro">{item ? `In stock: ${qty(item.stock)} ${item.unit}. Use Received, Used or Count to change the amount.` : "What you keep in stock, and when to reorder it."}</p>
      <ErrorBox error={error} />
      <div className="form" style={{ marginTop: error ? 12 : 0 }}>
        <label className="full">Product<input value={f.name} onChange={set("name")} placeholder="Developer 20 vol 1L" maxLength={200} /></label>
        <label>Category<input list="inv-cats" value={f.category} onChange={set("category")} placeholder="Colour" /></label>
        <label>Unit<input list="inv-units" value={f.unit} onChange={set("unit")} placeholder="bottle" /></label>
        {!item && <label>Opening stock<input type="number" step="any" value={f.stock} onChange={set("stock")} /></label>}
        <label>Reorder when at or below<input type="number" min="0" step="any" value={f.low_stock} onChange={set("low_stock")} /></label>
        <label>Cost price ({business.currency})<input type="number" min="0" step="0.01" value={f.cost_price} onChange={set("cost_price")} /></label>
        <label>Sell price ({business.currency}) <span className="hint">for retail</span><input type="number" min="0" step="0.01" value={f.sell_price} onChange={set("sell_price")} /></label>
        <label>Supplier<input value={f.supplier} onChange={set("supplier")} /></label>
        <label>SKU / barcode<input value={f.sku} onChange={set("sku")} /></label>
        <label className="full">Notes<textarea value={f.notes} onChange={set("notes")} /></label>
      </div>
      <datalist id="inv-cats">{["Colour", "Care", "Styling", "Retail", "Nails", "Skin", "Consumables"].map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="inv-units">{["pcs", "bottle", "tube", "box", "pack", "litre", "ml", "kg"].map((c) => <option key={c} value={c} />)}</datalist>
      <div className="foot">
        {item && <button className="btn ghost danger" style={{ marginRight: "auto" }} onClick={remove}>Delete</button>}
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={save}>{item ? "Save" : "Add product"}</button>
      </div>
    </>
  );
}

function MoveForm({ item, reason, onDone, onCancel }: { item: InventoryItem; reason: "received" | "used" | "sold" | "adjust"; onDone: (i: InventoryItem) => void; onCancel: () => void }) {
  const [n, setN] = useState(reason === "adjust" ? String(Number(item.stock)) : "1");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const title = { received: "Stock received", used: "Used in the salon", sold: "Sold to a client", adjust: "Stock count" }[reason];
  async function save() {
    try {
      const u = await api.post<InventoryItem>(`/inventory/${item.id}/move`, { change: Number(n) || 0, reason, note: note.trim() || null });
      toast(`${item.name}: ${qty(u.stock)} ${u.unit} in stock`);
      onDone(u);
    } catch (e) { setError((e as Error).message); }
  }
  return (
    <>
      <h2>{title}</h2>
      <p className="intro">{item.name} · now {qty(item.stock)} {item.unit}</p>
      <ErrorBox error={error} />
      <div className="form" style={{ marginTop: error ? 12 : 0 }}>
        <label>{reason === "adjust" ? `Counted amount (${item.unit})` : `How many (${item.unit})`}<input type="number" min="0" step="any" value={n} onChange={(e) => setN(e.target.value)} autoFocus /></label>
        <label>Note <span className="hint">(optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={reason === "received" ? "Invoice number" : ""} maxLength={300} /></label>
      </div>
      <div className="foot"><button className="btn" onClick={onCancel}>Cancel</button><button className="btn primary" onClick={save}>Save</button></div>
    </>
  );
}

function History({ item, onClose, onCount }: { item: InventoryItem; onClose: () => void; onCount: () => void }) {
  const [moves, setMoves] = useState<StockMove[] | null>(null);
  useEffect(() => { api.get<StockMove[]>(`/inventory/${item.id}/moves`).then(setMoves).catch(() => setMoves([])); }, [item.id]);
  return (
    <>
      <h2>{item.name}</h2>
      <p className="intro">{qty(item.stock)} {item.unit} in stock</p>
      <button className="btn sm" style={{ marginBottom: 12 }} onClick={onCount}>Record a stock count</button>
      {!moves ? <Loading /> : (
        <div className="list">
          {moves.map((m) => (
            <div className="row" key={m.id}>
              <div className="l"><b>{REASON[m.reason] ?? m.reason}</b><div>{fmtDateTime(m.created_at)}{m.note ? ` · ${m.note}` : ""}</div></div>
              <span className="mono" style={{ color: Number(m.change) < 0 ? "var(--bad)" : "var(--ok)", fontWeight: 600 }}>{Number(m.change) > 0 ? "+" : ""}{qty(m.change)}</span>
            </div>
          ))}
          {!moves.length && <div className="empty">No movements yet.</div>}
        </div>
      )}
      <div className="foot"><button className="btn" onClick={onClose}>Close</button></div>
    </>
  );
}
