"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { CustomerRef, CustomerSummary } from "@/lib/types";

const digits = (s: string) => s.replace(/\D/g, "");
const looksLikePhone = (s: string) => digits(s).length >= 6 && /^[\d\s+()-]+$/.test(s.trim());

/** Search-as-you-type customer picker. Pick an existing customer or add a new one.
 *  Reports a CustomerRef the API understands. Works with hundreds of imported contacts. */
export function CustomerPicker({ value, onChange, locked }: { value?: number | null; onChange: (ref: CustomerRef) => void; locked?: boolean }) {
  const [customers, setCustomers] = useState<CustomerSummary[] | null>(null);
  const [selId, setSelId] = useState<number | null>(value ?? null);
  const [isNew, setIsNew] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<CustomerSummary[]>("/customers").then(setCustomers).catch(() => setCustomers([]));
  }, []);
  useEffect(() => {
    if (value) { setSelId(value); setIsNew(false); }
  }, [value]);
  useEffect(() => {
    if (isNew) onChange({ new_customer: name.trim() ? { name: name.trim(), phone: phone.trim() || null } : null });
    else onChange({ customer_id: selId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, isNew, name, phone]);
  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const selected = customers?.find((c) => c.id === selId) ?? null;
  const matches = useMemo(() => {
    const all = customers ?? [];
    const t = q.trim().toLowerCase();
    if (!t) return all.slice(0, 8);
    const d = digits(t);
    return all.filter((c) => c.name.toLowerCase().includes(t) || (d.length >= 3 && digits(c.phone ?? "").includes(d))).slice(0, 8);
  }, [customers, q]);
  const options = [...matches.map((c) => ({ kind: "c" as const, c })), { kind: "new" as const }];

  function pick(i: number) {
    const o = options[i];
    if (!o) return;
    if (o.kind === "c") {
      setSelId(o.c.id);
      setIsNew(false);
    } else {
      setSelId(null);
      setIsNew(true);
      const t = q.trim();
      if (looksLikePhone(t)) setPhone(t); else if (t) setName(t);
    }
    setQ("");
    setOpen(false);
  }

  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && open) { e.preventDefault(); pick(hi); }
    else if (e.key === "Escape") setOpen(false);
  }

  if (locked) {
    return (
      <label className="full">
        Client
        <input id="customer" value={selected ? `${selected.name}${selected.phone ? ` · ${selected.phone}` : ""}` : "…"} disabled />
      </label>
    );
  }

  const chosen = selected && !isNew;
  return (
    <>
      <div className="full picker" ref={box}>
        <label htmlFor="customer">Client</label>
        {chosen ? (
          <div className="picked">
            <div><b>{selected.name}</b>{selected.phone && <span className="mono"> · {selected.phone}</span>}</div>
            <button type="button" className="btn sm" onClick={() => { setSelId(null); setOpen(true); setTimeout(() => document.getElementById("customer")?.focus(), 0); }}>Change</button>
          </div>
        ) : (
          <>
            <input
              id="customer"
              type="search"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              autoComplete="off"
              placeholder={customers?.length ? `Search ${customers.length} client${customers.length === 1 ? "" : "s"} by name or mobile…` : "Type a name to add a customer…"}
              value={q}
              onFocus={() => setOpen(true)}
              onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
              onKeyDown={key}
            />
            {open && (
              <ul className="picklist" id={listId} role="listbox">
                {customers === null && <li className="muted">Loading clients…</li>}
                {matches.map((c, i) => (
                  <li key={c.id} role="option" aria-selected={hi === i} onMouseDown={(e) => { e.preventDefault(); pick(i); }} onMouseEnter={() => setHi(i)}>
                    <b>{c.name}</b>{c.phone && <span className="mono">{c.phone}</span>}
                  </li>
                ))}
                {customers !== null && q.trim() && !matches.length && <li className="muted">No customer matches “{q.trim()}”.</li>}
                <li role="option" className="addnew" aria-selected={hi === matches.length} onMouseDown={(e) => { e.preventDefault(); pick(matches.length); }} onMouseEnter={() => setHi(matches.length)}>
                  + New client{q.trim() ? `: ${q.trim()}` : ""}
                </li>
              </ul>
            )}
          </>
        )}
      </div>
      {isNew && (
        <>
          <label>
            New client's name
            <input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" autoFocus={!name} />
          </label>
          <label>
            Mobile (for WhatsApp)
            <input id="nc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050 123 4567" inputMode="tel" />
          </label>
        </>
      )}
    </>
  );
}
