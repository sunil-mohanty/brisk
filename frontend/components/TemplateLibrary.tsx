"use client";

import { useEffect, useMemo, useState } from "react";
import type { Row } from "@/components/ItemsEditor";
import { useSession } from "@/components/session";
import { Sheet } from "@/components/Sheet";
import { toast } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { AUDIENCES, OFFER_TEMPLATES, type OfferTemplate } from "@/lib/offerTemplates";
import { audienceGender, matchServices, type Matched } from "@/lib/templateMatch";
import type { CatalogItem, MyTemplate } from "@/lib/types";
import { verticalOf } from "@/lib/words";

/** What a template puts into the New campaign form. */
export interface Applied {
  title: string;
  headline: string;
  description: string;
  rows: Row[];
  discount?: string;
  minutes?: string;
  notes?: string;
  from: { code?: string; name: string; category?: string; audience: string[] };
  missing: string[]; // services that need a price
}

type Filter = "all" | (typeof AUDIENCES)[number] | "mine";
type Pick = { kind: "lib"; t: OfferTemplate } | { kind: "mine"; t: MyTemplate };

export function useMyTemplates(): [MyTemplate[] | null, () => void] {
  const [mine, setMine] = useState<MyTemplate[] | null>(null);
  const load = () => { api.get<MyTemplate[]>("/campaigns/templates").then(setMine).catch(() => setMine([])); };
  useEffect(load, []);
  return [mine, load];
}

/** The library's rows for a template: the salon's menu items and prices, and anything not on the menu without a price. */
function rowsFor(m: Matched[]): Row[] {
  return m.filter((x) => !x.mergedInto).map((x) => ({
    description: x.item?.name ?? x.service, quantity: String(x.quantity), unit_price: x.item ? String(Number(x.item.unit_price)) : "",
  }));
}

export function applyLibrary(t: OfferTemplate, menu: CatalogItem[]): Applied {
  const m = matchServices(t.services, menu, audienceGender(t.audience));
  return {
    title: t.name, headline: t.headline, description: t.description, rows: rowsFor(m),
    from: { code: t.code, name: t.name, category: t.category, audience: t.audience },
    missing: m.filter((x) => !x.item && !x.mergedInto).map((x) => x.service),
  };
}

export function applyMine(t: MyTemplate): Applied {
  const rows = t.services.map((s) => ({ description: s.description, quantity: String(Number(s.quantity) || 1), unit_price: s.unit_price == null ? "" : String(Number(s.unit_price)) }));
  return {
    title: t.name, headline: t.headline ?? "", description: t.description ?? "", rows,
    discount: Number(t.discount) ? String(Number(t.discount)) : undefined, minutes: t.duration_min ? String(t.duration_min) : undefined, notes: t.notes ?? undefined,
    from: { name: t.name, category: t.category ?? undefined, audience: t.audience },
    missing: rows.filter((r) => !r.unit_price).map((r) => r.description),
  };
}

/** The strip at the top of "Create the offer": start from a ready-made offer or one of your own. */
export function TemplateStrip({ menu, applied, onApply, onClear, mine, reloadMine, initial }: {
  menu: CatalogItem[]; applied: Applied | null; onApply: (a: Applied) => void; onClear: () => void;
  mine: MyTemplate[] | null; reloadMine: () => void; initial?: string | null;
}) {
  const { business } = useSession();
  const salon = verticalOf(business.business_type) === "salon";
  const [open, setOpen] = useState<Filter | null>(null);
  const hasMine = !!mine?.length;

  // Arriving with ?template=L01 (e.g. from an idea on the Quote & Campaign page)
  useEffect(() => {
    if (!initial || applied || !salon) return;
    const t = OFFER_TEMPLATES.find((x) => x.code === initial.toUpperCase());
    if (t) onApply(applyLibrary(t, menu));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, menu]);

  if (!salon && !hasMine) return null;

  if (applied) {
    return (
      <div className="tpl-applied" role="status">
        <span className="tpl-applied-ico" aria-hidden="true">✓</span>
        <div>
          <b>{applied.from.code ? `${applied.from.code} · ` : ""}{applied.from.name}</b>
          <span className="small">
            {applied.missing.length
              ? <>Add your price for <b>{applied.missing.join(", ")}</b>, or remove {applied.missing.length === 1 ? "it" : "them"}. Everything else is from your menu.</>
              : "Services and prices are from your menu. Change anything you like."}
          </span>
        </div>
        <div className="tpl-applied-acts">
          <button type="button" className="btn sm" onClick={() => setOpen(salon ? "all" : "mine")}>Change template</button>
          <button type="button" className="linkbtn small" onClick={onClear}>Start blank</button>
        </div>
        <Library open={open} setOpen={setOpen} menu={menu} mine={mine} reloadMine={reloadMine} onApply={onApply} />
      </div>
    );
  }

  return (
    <div className="tpl-strip">
      <div className="tpl-strip-t">
        <span className="tpl-spark" aria-hidden="true">{SPARK}</span>
        <div>
          <b>{salon ? "Start from a ready-made offer" : "Start from one of your templates"}</b>
          <span className="small muted">{salon ? `${OFFER_TEMPLATES.length} offers for ladies, gentlemen, unisex and bridal. Use one as it is, or as a starting point.` : "Offers you saved before, ready to send again."}</span>
        </div>
        <button type="button" className="btn primary" onClick={() => setOpen(salon ? "all" : "mine")}>Browse templates</button>
      </div>
      <div className="tpl-strip-chips">
        {salon && AUDIENCES.map((a) => (
          <button type="button" key={a} className="chip" onClick={() => setOpen(a)}>{a} <span className="mono">{OFFER_TEMPLATES.filter((t) => t.audience.includes(a)).length}</span></button>
        ))}
        {hasMine && <button type="button" className="chip mine" onClick={() => setOpen("mine")}>My templates <span className="mono">{mine!.length}</span></button>}
      </div>
      <Library open={open} setOpen={setOpen} menu={menu} mine={mine} reloadMine={reloadMine} onApply={onApply} />
    </div>
  );
}

const SPARK = <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></svg>;

function Library({ open, setOpen, menu, mine, reloadMine, onApply }: {
  open: Filter | null; setOpen: (f: Filter | null) => void; menu: CatalogItem[]; mine: MyTemplate[] | null; reloadMine: () => void; onApply: (a: Applied) => void;
}) {
  const { business } = useSession();
  const salon = verticalOf(business.business_type) === "salon";
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Pick | null>(null);
  const filter = open ?? "all";
  useEffect(() => { if (open) { setSel(null); setQ(""); } }, [open]);

  const t = q.trim().toLowerCase();
  const hit = (s: string) => !t || s.toLowerCase().includes(t);
  const lib = filter === "mine" || !salon ? [] : OFFER_TEMPLATES.filter((x) => (filter === "all" || x.audience.includes(filter))
    && (hit(x.name) || hit(x.headline) || hit(x.category) || hit(x.code) || x.services.some(hit)));
  const own = filter === "mine" || filter === "all" ? (mine ?? []).filter((x) => hit(x.name) || hit(x.headline ?? "") || x.services.some((s) => hit(s.description))) : [];
  const count = (f: Filter) => (f === "all" ? OFFER_TEMPLATES.length : f === "mine" ? mine?.length ?? 0 : OFFER_TEMPLATES.filter((x) => x.audience.includes(f)).length);
  const filters: Filter[] = salon ? ["all", ...AUDIENCES, ...(mine?.length ? ["mine" as const] : [])] : ["mine"];

  function use(p: Pick) {
    const a = p.kind === "lib" ? applyLibrary(p.t, menu) : applyMine(p.t);
    onApply(a);
    setOpen(null);
    toast(a.missing.length ? `Template added. Set your price for ${a.missing.length} service${a.missing.length === 1 ? "" : "s"}.` : "Template added. Check the details, then publish.");
  }
  async function remove(x: MyTemplate) {
    try { await api.del(`/campaigns/templates/${x.id}`); toast("Template deleted"); setSel(null); reloadMine(); }
    catch (e) { toast((e as Error).message); }
  }

  return (
    <Sheet open={!!open} onClose={() => setOpen(null)} wide>
      <div className={`tpl-lib${sel ? " has-sel" : ""}`}>
        <header className="tpl-lib-h">
          <div>
            <h2>Offer templates</h2>
            <p className="intro">Pick one to start. It fills in the offer with your own menu and prices, and you can change every word.</p>
          </div>
          <button type="button" className="tpl-x" aria-label="Close" onClick={() => setOpen(null)}>×</button>
        </header>
        <div className="tpl-filters">
          <div className="tpl-chips" role="tablist" aria-label="Who it's for">
            {filters.map((f) => (
              <button type="button" role="tab" key={f} className="chip" aria-pressed={filter === f} aria-selected={filter === f} onClick={() => { setOpen(f); }}>
                {f === "all" ? "All" : f === "mine" ? "My templates" : f} <span className="mono">{count(f)}</span>
              </button>
            ))}
          </div>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: facial, beard, Eid, bridal…" aria-label="Search templates" />
        </div>
        <div className="tpl-body">
          <div className="tpl-grid" role="list">
            {own.map((x) => (
              <button type="button" role="listitem" key={x.id} className={`tpl-card mine${sel?.kind === "mine" && sel.t.id === x.id ? " on" : ""}`} onClick={() => setSel({ kind: "mine", t: x })}>
                <span className="tpl-meta"><span className="tpl-code">Yours</span>{x.category && <span>{x.category}</span>}</span>
                <b className="tpl-name">{x.name}</b>
                {x.headline && <i className="tpl-head">{x.headline}</i>}
                <span className="tpl-svcs">{x.services.map((s) => s.description).join(" · ")}</span>
              </button>
            ))}
            {lib.map((x) => (
              <button type="button" role="listitem" key={x.code} className={`tpl-card${sel?.kind === "lib" && sel.t.code === x.code ? " on" : ""}`} onClick={() => setSel({ kind: "lib", t: x })}>
                <span className="tpl-meta"><span className="tpl-code">{x.code}</span><span>{x.category}</span></span>
                <b className="tpl-name">{x.name}</b>
                <i className="tpl-head">{x.headline}</i>
                <span className="tpl-svcs">{x.services.join(" · ")}</span>
              </button>
            ))}
            {!own.length && !lib.length && <div className="empty">{filter === "mine" ? "No templates of your own yet. Fill in an offer, then tap “Save as my template”." : `Nothing matches “${q}”.`}</div>}
          </div>
          {sel && <Preview pick={sel} menu={menu} onBack={() => setSel(null)} onUse={() => use(sel)} onDelete={sel.kind === "mine" ? () => remove(sel.t) : undefined} />}
        </div>
      </div>
    </Sheet>
  );
}

function Preview({ pick, menu, onBack, onUse, onDelete }: { pick: Pick; menu: CatalogItem[]; onBack: () => void; onUse: () => void; onDelete?: () => void }) {
  const { business } = useSession();
  const cur = business.currency;
  const lines = useMemo(() => {
    if (pick.kind === "mine") return pick.t.services.map((s) => ({ label: s.description, qty: Number(s.quantity) || 1, price: s.unit_price == null ? null : Number(s.unit_price), note: "" }));
    return matchServices(pick.t.services, menu, audienceGender(pick.t.audience)).map((m) => ({
      label: m.service, qty: m.quantity, price: m.item ? Number(m.item.unit_price) : null,
      note: m.mergedInto ? `Part of “${m.mergedInto}”` : m.item ? `Your “${m.item.name}”` : "Not on your menu: you set the price",
      merged: !!m.mergedInto,
    }));
  }, [pick, menu]);
  const priced = lines.filter((l) => l.price != null);
  const sum = priced.reduce((a, l) => a + l.price! * l.qty, 0);
  const missing = lines.filter((l) => l.price == null && !("merged" in l && l.merged)).length;
  const t = pick.t;

  return (
    <aside className="tpl-prev" aria-label="Template preview">
      <button type="button" className="linkbtn small tpl-back" onClick={onBack}>← All templates</button>
      <div className="tpl-prev-hero">
        <span className="tpl-meta"><span className="tpl-code">{pick.kind === "lib" ? pick.t.code : "Yours"}</span>{t.category && <span>{t.category}</span>}</span>
        {t.headline && <p className="tpl-prev-head">{t.headline}</p>}
        <h3>{t.name}</h3>
        {!!t.audience.length && <div className="tpl-tags">{t.audience.map((a) => <span key={a}>{a}</span>)}</div>}
      </div>
      {t.description && <p className="tpl-prev-desc">{t.description}</p>}
      <h4>What&apos;s included{pick.kind === "lib" && menu.length ? ", from your menu" : ""}</h4>
      <ul className="tpl-lines">
        {lines.map((l, i) => (
          <li key={i} className={l.price == null ? ("merged" in l && l.merged ? "merged" : "missing") : undefined}>
            <span><b>{l.qty > 1 ? `${l.qty} × ` : ""}{l.label}</b>{l.note && <small>{l.note}</small>}</span>
            <span className="mono">{l.price != null ? money(l.price * l.qty, cur) : "merged" in l && l.merged ? "incl." : "—"}</span>
          </li>
        ))}
      </ul>
      <div className="tpl-sum">
        <span>{missing ? `At your prices, so far` : "At your menu prices"}</span>
        <b className="mono">{money(sum, cur)}</b>
      </div>
      {pick.kind === "mine" && Number(pick.t.discount) > 0 && (
        <div className="tpl-sum"><span>Your offer discount</span><b className="mono">−{money(Number(pick.t.discount), cur)}</b></div>
      )}
      <p className="small muted tpl-tip">
        {missing ? `You'll add the price for ${missing} service${missing === 1 ? "" : "s"} after choosing. ` : ""}
        Add a discount on the next screen to make it an offer: clients see the old price crossed out.
      </p>
      <div className="tpl-prev-acts">
        {onDelete && <button type="button" className="btn ghost" onClick={onDelete}>Delete</button>}
        <button type="button" className="btn primary" onClick={onUse}>Use this template</button>
      </div>
    </aside>
  );
}
