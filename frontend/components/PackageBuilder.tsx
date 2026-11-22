"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useSession } from "@/components/session";
import { toast } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { CatalogItem, PackagePart } from "@/lib/types";
import { duration } from "@/lib/vocab";

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Make a package from services on the menu: pick what's in it, see what it's worth, set the package price. */
export function PackageBuilder({ open, editing, menu, onClose, onSaved }: {
  open: boolean; editing: CatalogItem | null; menu: CatalogItem[]; onClose: () => void; onSaved: (items: CatalogItem[]) => void;
}) {
  const { business } = useSession();
  const [name, setName] = useState("");
  const [parts, setParts] = useState<PackagePart[]>([]);
  const [price, setPrice] = useState("");
  const [minutes, setMinutes] = useState("");
  const [cat, setCat] = useState("Packages");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? ""); setParts(editing?.includes ?? []); setPrice(editing ? String(Number(editing.unit_price)) : "");
    setMinutes(editing?.duration_min ? String(editing.duration_min) : ""); setCat(editing?.category ?? "Packages"); setQ("");
  }, [open, editing]);

  const services = menu.filter((m) => !m.includes?.length && m.id !== editing?.id);
  const by = useMemo(() => new Map(menu.map((m) => [key(m.name), m])), [menu]);
  const worth = parts.reduce((t, p) => t + Number(by.get(key(p.name))?.unit_price ?? 0) * p.qty, 0);
  const autoMin = parts.reduce((t, p) => t + (by.get(key(p.name))?.duration_min ?? 0) * p.qty, 0);
  const save = Number(price) > 0 && worth > Number(price) ? worth - Number(price) : 0;
  const list = services.filter((m) => !q || key(m.name).includes(key(q)));

  function toggle(m: CatalogItem) {
    setParts((ps) => ps.some((p) => key(p.name) === key(m.name)) ? ps.filter((p) => key(p.name) !== key(m.name)) : [...ps, { name: m.name, qty: 1 }]);
  }
  const qty = (i: number, d: number) => setParts((ps) => ps.map((p, n) => (n === i ? { ...p, qty: Math.max(1, Math.min(20, p.qty + d)) } : p)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || parts.length < 2 || price === "") return;
    setBusy(true);
    const body = { name: name.trim(), unit_price: Number(price), category: cat.trim() || null, duration_min: Number(minutes) || autoMin || null, includes: parts };
    try {
      if (editing) {
        await api.patch<CatalogItem>(`/catalog/${editing.id}`, body);
        onSaved(await api.get<CatalogItem[]>("/catalog"));
      } else {
        onSaved(await api.post<CatalogItem[]>("/catalog", [body]));
      }
      toast(editing ? "Package updated" : "Package added to your menu");
      onClose();
    } catch (err) { toast((err as Error).message); }
    setBusy(false);
  }

  return (
    <Sheet open={open} onClose={onClose} wide>
      <form className="pkgb" onSubmit={submit}>
        <header className="scan-h">
          <div>
            <h2>{editing ? "Edit package" : "New package"}</h2>
            <p className="muted small">Bundle services for one price. It works like any service: on bookings, quotes, campaigns and your link page.</p>
          </div>
          <button type="button" className="tpl-x" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <label className="full">Package name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bride-to-Be Glow Package" maxLength={300} required />
        </label>

        <div className="pkgb-cols">
          <div className="pkgb-pick">
            <b className="small">1. What&apos;s in it</b>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your services" aria-label="Search your services" />
            <div className="pkgb-list">
              {!services.length && <p className="muted small">Add services to your menu first, then bundle them here.</p>}
              {list.map((m) => {
                const on = parts.some((p) => key(p.name) === key(m.name));
                return (
                  <button type="button" key={m.id} className={`pkgb-svc${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(m)}>
                    <span>{on ? "✓" : "+"}</span><b>{m.name}</b><small>{money(m.unit_price, business.currency)}{m.duration_min ? ` · ${duration(m.duration_min)}` : ""}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pkgb-sum">
            <b className="small">2. The package</b>
            {parts.length ? (
              <ul className="pkgb-parts">
                {parts.map((p, i) => {
                  const m = by.get(key(p.name));
                  return (
                    <li key={p.name}>
                      <span className="pkgb-qty">
                        <button type="button" aria-label={`One less ${p.name}`} onClick={() => qty(i, -1)} disabled={p.qty <= 1}>−</button>
                        <b>{p.qty}</b>
                        <button type="button" aria-label={`One more ${p.name}`} onClick={() => qty(i, 1)}>+</button>
                      </span>
                      <span className="pkgb-pn">{p.name}{!m && <small className="muted"> (not on your menu)</small>}</span>
                      <span className="mono small">{m ? money(Number(m.unit_price) * p.qty, business.currency) : "–"}</span>
                      <button type="button" className="pkgb-x" aria-label={`Remove ${p.name}`} onClick={() => setParts((ps) => ps.filter((_, n) => n !== i))}>×</button>
                    </li>
                  );
                })}
                <li className="pkgb-worth"><span>Worth one by one</span><b className="mono">{money(worth, business.currency)}</b></li>
              </ul>
            ) : <p className="muted small">Tap at least two services on the left.</p>}

            <label>Package price ({business.currency})
              <input type="number" min="0" step="1" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={worth ? String(Math.round(worth * 0.85)) : "0"} required />
            </label>
            {worth > 0 && (
              <div className="chips-inline">
                {[10, 15, 20, 25].map((pc) => (
                  <button type="button" key={pc} className="chip" onClick={() => setPrice(String(Math.round(worth * (1 - pc / 100))))}>{pc}% off</button>
                ))}
              </div>
            )}
            {save > 0 && <p className="pkgb-save">Clients save {money(save, business.currency)} ({Math.round((save / worth) * 100)}%)</p>}
            <div className="pkgb-row">
              <label>Minutes
                <input type="number" min="5" max="720" step="5" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder={autoMin ? String(autoMin) : "–"} />
              </label>
              <label>Category
                <input value={cat} list="menu-cats" onChange={(e) => setCat(e.target.value)} maxLength={60} />
              </label>
            </div>
            {autoMin > 0 && !minutes && <span className="hint">Takes {duration(autoMin)}, the services together. Set your own if it&apos;s quicker.</span>}
          </div>
        </div>

        <div className="scan-foot">
          <span className="small muted">{parts.length === 1 ? "A package needs at least two services." : ""}</span>
          <button className="btn primary" disabled={busy || !name.trim() || parts.length < 2 || price === ""}>{busy ? "Saving…" : editing ? "Save package" : "Add package"}</button>
        </div>
      </form>
    </Sheet>
  );
}
