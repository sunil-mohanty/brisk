"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { CatalogItem } from "@/lib/types";

export interface Row { description: string; quantity: string; unit_price: string }
export const blankRow: Row = { description: "", quantity: "1", unit_price: "" };

export function cleanRows(rows: Row[]) {
  return rows.filter((r) => r.description.trim() && r.unit_price !== "").map((r) => ({
    description: r.description.trim(), quantity: Number(r.quantity) || 1, unit_price: Number(r.unit_price),
  }));
}

export function rowTotals(rows: Row[], discount: string, vat: string) {
  const sub = rows.reduce((a, r) => a + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);
  const disc = Math.min(Number(discount) || 0, sub);
  const vatAmt = Math.round((sub - disc) * (Number(vat) || 0)) / 100;
  return { sub, disc, vat: vatAmt, total: sub - disc + vatAmt };
}

/** Service lines with one-tap menu chips. Reports the menu so callers can total up minutes. */
export function ItemsEditor({ rows, setRows, onMenu }: { rows: Row[]; setRows: (r: Row[]) => void; onMenu?: (m: CatalogItem[]) => void }) {
  const { business } = useSession();
  const [menu, setMenu] = useState<CatalogItem[]>([]);
  useEffect(() => { api.swr<CatalogItem[]>("/catalog", (m) => { setMenu(m); onMenu?.(m); }).catch(() => {}); }, [onMenu]);
  const byName = useMemo(() => new Map(menu.map((c) => [c.name.trim().toLowerCase(), c])), [menu]);
  const cur = business.currency;
  const update = (i: number, k: keyof Row, val: string) => setRows(rows.map((r, n) => {
    if (n !== i) return r;
    const next = { ...r, [k]: val };
    const hit = k === "description" ? byName.get(val.trim().toLowerCase()) : undefined;
    if (hit && !r.unit_price) next.unit_price = String(Number(hit.unit_price));
    return next;
  }));
  const add = (c: CatalogItem) => {
    const row = { description: c.name, quantity: "1", unit_price: String(Number(c.unit_price)) };
    const empty = rows.findIndex((r) => !r.description.trim() && !r.unit_price);
    setRows(empty >= 0 ? rows.map((r, n) => (n === empty ? row : r)) : [...rows, row]);
  };
  return (
    <div className="full">
      {menu.length > 0 && (
        <div className="pricechips">
          <span className="small muted">Tap to add from your menu:</span>
          <div className="chips-inline">
            {menu.slice(0, 12).map((c) => <button type="button" key={c.id} className="chip" onClick={() => add(c)}>+ {c.name} <span className="mono">{money(c.unit_price, cur)}</span></button>)}
            <Link className="chip linkchip" href="/menu">Edit menu</Link>
          </div>
        </div>
      )}
      <div className="items">
        <div className="item itemhead" aria-hidden="true"><span>Service</span><span>Qty</span><span>Price each ({cur})</span><span /></div>
        {rows.map((r, i) => (
          <div className="item" key={i}>
            <span className="ifield" data-l="Service"><input aria-label="Service" list="menu-list" value={r.description} onChange={(e) => update(i, "description", e.target.value)} placeholder={i ? "Another service" : "Bridal hair & makeup"} /></span>
            <span className="ifield" data-l="Qty"><input aria-label="Quantity" type="number" min="0.01" step="any" inputMode="decimal" value={r.quantity} onChange={(e) => update(i, "quantity", e.target.value)} /></span>
            <span className="ifield" data-l={`Price each (${cur})`}><input aria-label={`Price each (${cur})`} type="number" min="0" step="0.01" inputMode="decimal" value={r.unit_price} onChange={(e) => update(i, "unit_price", e.target.value)} placeholder="0.00" /></span>
            <button type="button" aria-label="Remove line" onClick={() => rows.length > 1 && setRows(rows.filter((_, n) => n !== i))}>×</button>
          </div>
        ))}
      </div>
      <datalist id="menu-list">{menu.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      <div className="itemfoot"><button type="button" className="btn sm" onClick={() => setRows([...rows, { ...blankRow }])}>+ Add service</button></div>
    </div>
  );
}

export function Totals({ rows, discount, vat }: { rows: Row[]; discount: string; vat: string }) {
  const { business } = useSession();
  const t = rowTotals(rows, discount, vat);
  const cur = business.currency;
  return (
    <div className="totals">
      <div><span>Subtotal</span><span className="mono">{money(t.sub, cur)}</span></div>
      {t.disc > 0 && <div><span>Discount</span><span className="mono">−{money(t.disc, cur)}</span></div>}
      <div><span>VAT {vat}%</span><span className="mono">{money(t.vat, cur)}</span></div>
      <div className="grand"><span>Total</span><span className="mono">{money(t.total, cur)}</span></div>
    </div>
  );
}
