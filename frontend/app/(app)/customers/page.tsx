"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { ErrorBox, Loading, PageHead, Pill } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { CustomerSummary } from "@/lib/types";
import { Tip } from "@/components/Tips";

const STAGE_PILL = { Acquire: "new", Quote: "quoted", Serve: "accepted", Retain: "won" } as const;
const STAGE_LABEL = { Acquire: "Enquired", Quote: "Quoted", Serve: "Visited", Retain: "Regular" } as const;

export default function CustomersPage() {
  const { business } = useSession();
  const [rows, setRows] = useState<CustomerSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.swr<CustomerSummary[]>(`/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`, setRows).catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <PageHead
        eyebrow="Client list"
        title="Clients"
        sub="One record per client, with their enquiries, quotes and visits. Same mobile number, same record."
        action={
          <div className="acts">
            <input id="customer-search" className="headsearch" type="search" placeholder="Search name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
            <Tip id="c.import" order={1} text="Bring in the clients you already have: pick them from your phone contacts, or upload Excel or a list."><Link className="btn primary" href="/customers/import">Import clients</Link></Tip>
          </div>
        }
      />
      <ErrorBox error={error} />
      {!rows ? <Loading /> : (
        <div className="tablewrap">
          <table className="ctable">
            <thead><tr><th>Client</th><th>Found you via</th><th>Enquiries</th><th>Quotes</th><th>Visits</th><th className="num">Lifetime value</th><th>Stage</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="c-main"><b>{c.name}</b><div className="sub mono">{c.phone}{c.area ? ` · ${c.area}` : ""}</div></td>
                  <td className="c-stat" data-label="From">{c.first_source ?? (c.notes?.startsWith("Imported") ? "Imported" : "Manual")}</td>
                  <td className="mono c-stat" data-label="Leads">{c.leads}</td>
                  <td className="mono c-stat" data-label="Quotes">{c.quotes}</td>
                  <td className="mono c-stat" data-label="Services">{c.services}</td>
                  <td className="num c-end">{money(c.lifetime_value, business.currency)}</td>
                  <td className="c-stat c-first"><Pill status={STAGE_PILL[c.stage]} label={STAGE_LABEL[c.stage]} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="empty">{q ? "No clients match that search." : <>No clients yet. <Link href="/customers/import">Import them from your phone, Excel or a list</Link>.</>}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
