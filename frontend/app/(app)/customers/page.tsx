"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { ErrorBox, Loading, PageHead, Pill, toast } from "@/components/ui";
import { CategoryManager, CategoryToggles, TagChips, useCategories } from "@/components/Segments";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { Campaign, Categories, CustomerSummary } from "@/lib/types";
import { Tip } from "@/components/Tips";
import { words } from "@/lib/words";

const STAGE_PILL = { Acquire: "new", Quote: "quoted", Serve: "accepted", Retain: "won" } as const;
const STAGE_LABEL = { Acquire: "Enquired", Quote: "Quoted", Serve: "Visited", Retain: "Regular" } as const;
const NONE = "\u0000none"; // the "No category" filter
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export default function CustomersPage() {
  const { business } = useSession();
  const W = words(business.business_type);
  const [rows, setRows] = useState<CustomerSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [cats, setCats] = useCategories();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [managing, setManaging] = useState(false);
  const names = (cats?.categories ?? []).map((t) => t.name);
  const inView = (t: string[]) => !tag || (tag === NONE ? t.length === 0 : t.some((y) => same(y, tag)));

  // Links from the import page: /customers?uncategorised=1 or ?category=Bridal
  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    if (u.get("uncategorised")) setTag(NONE);
    else if (u.get("category")) setTag(u.get("category"));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams();
      if (q) qs.set("q", q);
      if (tag === NONE) qs.set("uncategorised", "true");
      else if (tag) qs.set("tag", tag);
      api.swr<CustomerSummary[]>(`/customers${qs.size ? `?${qs}` : ""}`, setRows).catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, tag]);
  useEffect(() => { setPicked(new Set()); }, [tag]);

  const refreshCats = () => api.get<Categories>("/customers/categories").then(setCats).catch(() => {});
  async function setRowTags(c: CustomerSummary, next: string[]) {
    setRows((rs) => rs && rs.map((x) => x.id === c.id ? { ...x, tags: next } : x));
    try {
      const r = await api.put<CustomerSummary>(`/customers/${c.id}/tags`, { tags: next });
      setRows((rs) => rs && rs.map((x) => x.id === c.id ? { ...x, tags: r.tags } : x));
      refreshCats();
    } catch (e) { toast((e as Error).message); }
  }
  function doneEditing() {
    setEditing(null);
    setRows((rs) => rs && rs.filter((x) => inView(x.tags)));  // a client who left this view drops out once you're done
  }
  async function bulk(add: string | null, remove: string | null) {
    const ids = [...picked];
    try {
      setCats(await api.post<Categories>("/customers/tags/bulk", { customer_ids: ids, add, remove }));
      setRows((rs) => rs && rs.map((x) => {
        if (!picked.has(x.id)) return x;
        let t = x.tags.filter((y) => !remove || !same(y, remove));
        if (add && !t.some((y) => same(y, add))) t = [...t, add];
        return { ...x, tags: t };
      }).filter((x) => inView(x.tags)));
      toast(add ? `Added ${ids.length} client${ids.length === 1 ? "" : "s"} to “${add}”` : `Took ${ids.length} out of “${remove}”`);
      setPicked(new Set());
    } catch (e) { toast((e as Error).message); }
  }
  async function reloadAfterManage(c: Categories) {
    setCats(c);
    if (tag && tag !== NONE && !c.categories.some((x) => same(x.name, tag))) setTag(null);
    const qs = tag === NONE ? "?uncategorised=true" : tag && c.categories.some((x) => same(x.name, tag)) ? `?tag=${encodeURIComponent(tag)}` : "";
    api.get<CustomerSummary[]>(`/customers${qs}`).then(setRows).catch(() => {});
  }
  const all = !!rows?.length && rows.every((r) => picked.has(r.id));
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <PageHead
        eyebrow="Client list"
        title="Clients"
        sub={`One record per client, with their enquiries, quotes and ${W.visits}. Same mobile number, same record.`}
        action={
          <div className="acts">
            <input id="customer-search" className="headsearch" type="search" placeholder="Search name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
            <Tip id="c.import" order={1} text="Bring in the clients you already have: pick them from your phone contacts, or upload Excel or a list."><Link className="btn primary" href="/customers/import">Import clients</Link></Tip>
          </div>
        }
      />
      <ErrorBox error={error} />
      <div className="segbar" role="tablist" aria-label="Client categories">
        <button type="button" role="tab" aria-selected={!tag} className={`segchip${!tag ? " on" : ""}`} onClick={() => setTag(null)}>All clients</button>
        {(cats?.categories ?? []).map((t) => (
          <button type="button" role="tab" key={t.name} aria-selected={tag === t.name} className={`segchip${tag === t.name ? " on" : ""}`} onClick={() => setTag(t.name)}>
            {t.name} <span>{t.count}</span>
          </button>
        ))}
        {!!cats?.categories.length && (
          <button type="button" role="tab" aria-selected={tag === NONE} className={`segchip none${tag === NONE ? " on" : ""}`} onClick={() => setTag(NONE)}>
            No category <span>{cats.uncategorised}</span>
          </button>
        )}
        <button type="button" className="btn sm ghost" onClick={() => setManaging(!managing)}>{cats?.categories.length ? "Manage categories" : "+ Create categories"}</button>
        {tag && tag !== NONE && <button type="button" className="btn sm wa segsend" onClick={() => setSending(true)}>Send a campaign to {tag}</button>}
      </div>
      {managing && cats && <CategoryManager cats={cats} onSaved={reloadAfterManage} onClose={() => setManaging(false)} />}
      {cats && !cats.categories.length && !managing && (
        <div className="banner info" style={{ marginBottom: 14 }}>
          Sort your clients into up to {cats.max} categories you name yourself, like Bridal, VIP or Corporate. Then send a campaign to just one category.{" "}
          <button type="button" className="linkbtn" style={{ padding: 0, margin: 0 }} onClick={() => setManaging(true)}>Create categories</button>
        </div>
      )}
      {tag === NONE && rows && rows.length > 0 && picked.size === 0 && (
        <div className="banner info" style={{ marginBottom: 14 }}>
          {rows.length} client{rows.length === 1 ? " isn't" : "s aren't"} in a category yet, for example your imported contacts.{" "}
          <button type="button" className="linkbtn" style={{ padding: 0, margin: 0 }} onClick={() => setPicked(new Set(rows.map((r) => r.id)))}>Select all {rows.length}</button>{" "}
          or tick the ones you want, then choose a category.
        </div>
      )}
      {sending && tag && tag !== NONE && <PickCampaign tag={tag} onClose={() => setSending(false)} />}
      {picked.size > 0 && (
        <div className="bulkbar" role="region" aria-label="Selected clients">
          <b>{picked.size}<span className="hide-sm"> selected</span></b>
          {rows && picked.size < rows.length && <button type="button" className="btn sm ghost hide-sm" onClick={() => setPicked(new Set(rows.map((r) => r.id)))}>Select all {rows.length}</button>}
          {names.length ? (
            <span className="bulk-cats">
              <span className="hide-sm">Add to</span>
              {names.filter((n) => !tag || tag === NONE || !same(n, tag)).map((n) => <button type="button" key={n} className="btn sm" onClick={() => bulk(n, null)}>+ {n}</button>)}
            </span>
          ) : <button type="button" className="btn sm" onClick={() => setManaging(true)}>Create categories first</button>}
          {tag && tag !== NONE && <button type="button" className="btn sm ghost danger" onClick={() => bulk(null, tag)}>Remove from {tag}</button>}
          <button type="button" className="btn sm ghost" onClick={() => setPicked(new Set())} aria-label="Clear selection">✕</button>
        </div>
      )}
      {!rows ? <Loading /> : (
        <div className="tablewrap">
          <table className="ctable">
            <thead><tr><th className="c-pick"><input type="checkbox" aria-label="Select all" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} /></th><th>Client</th><th>Found you via</th><th>Enquiries</th><th>Quotes</th><th>{W.Visits}</th><th className="num">Lifetime value</th><th>Stage</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className={picked.has(c.id) ? "is-picked" : undefined}>
                  <td className="c-pick"><input type="checkbox" aria-label={`Select ${c.name}`} checked={picked.has(c.id)} onChange={() => toggle(c.id)} /></td>
                  <td className="c-main">
                    <b>{c.name}</b><div className="sub mono">{c.phone}{c.area ? ` · ${c.area}` : ""}</div>
                    {(names.length > 0 || c.tags.length > 0) && (
                      <div className="c-tags">
                        {editing === c.id
                          ? <CategoryToggles all={names} on={c.tags} onChange={(t) => setRowTags(c, t)} onDone={doneEditing} />
                          : <>
                              <TagChips tags={c.tags} />
                              <button type="button" className="tagadd" onClick={() => setEditing(c.id)}>{c.tags.length ? "Change" : "+ Category"}</button>
                            </>}
                      </div>
                    )}
                  </td>
                  <td className="c-stat" data-label="From">{c.first_source ?? (c.notes?.startsWith("Imported") ? "Imported" : "Manual")}</td>
                  <td className="mono c-stat" data-label="Leads">{c.leads}</td>
                  <td className="mono c-stat" data-label="Quotes">{c.quotes}</td>
                  <td className="mono c-stat" data-label={W.Visits}>{c.services}</td>
                  <td className="num c-end">{money(c.lifetime_value, business.currency)}</td>
                  <td className="c-stat c-first"><Pill status={STAGE_PILL[c.stage]} label={STAGE_LABEL[c.stage]} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="empty">{tag === NONE ? "Every client is in a category." : tag ? `No clients in “${tag}”${q ? " match that search" : ""}.` : q ? "No clients match that search." : <>No clients yet. <Link href="/customers/import">Import them from your phone, Excel or a list</Link>.</>}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Pick which campaign to send to a segment, then go to its send list. */
function PickCampaign({ tag, onClose }: { tag: string; onClose: () => void }) {
  const router = useRouter();
  const [list, setList] = useState<Campaign[] | null>(null);
  useEffect(() => { api.get<Campaign[]>("/campaigns").then((cs) => setList(cs.filter((c) => c.active && !c.expired))).catch(() => setList([])); }, []);
  return (
    <div className="panel pickcamp">
      <b>Which campaign should “{tag}” get?</b>
      {!list ? <span className="small muted">Loading…</span> : list.length === 0 ? (
        <span className="small">No live campaigns. <Link href="/quotes/campaigns/new">Create one</Link> first.</span>
      ) : (
        <div className="pickcamp-list">
          {list.map((c) => (
            <button type="button" key={c.id} className="btn sm" onClick={() => router.push(`/quotes/campaigns/${c.id}?send=${encodeURIComponent(tag)}#send`)}>{c.title}</button>
          ))}
        </div>
      )}
      <button type="button" className="btn sm ghost" onClick={onClose}>Cancel</button>
    </div>
  );
}
