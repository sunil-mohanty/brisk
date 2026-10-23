"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { ErrorBox, Loading, PageHead, Pill, QuotePill } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import type { Quote } from "@/lib/types";

export default function QuotesPage() {
  const { business } = useSession();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.swr<Quote[]>("/quotes", setQuotes).catch((e) => setError(e.message)); }, []);

  return (
    <>
      <PageHead
        eyebrow="Quote"
        title="Quotes"
        sub="For bridal, events and packages. Send a link on WhatsApp and see when your client opens it."
        action={<Link className="btn primary" href="/quotes/new">+ New quote</Link>}
      />
      <ErrorBox error={error} />
      {!quotes ? <Loading /> : (
        <div className="tablewrap">
          <table className="ctable">
            <thead><tr><th>Quote</th><th>Client</th><th className="num">Total</th><th>Status</th><th>Opened</th><th /></tr></thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td className="c-stat c-first c-label"><Link className="rowlink mono" href={`/quotes/${q.id}`}>{q.label}</Link><div className="sub">{fmtDate(q.created_at)}</div></td>
                  <td className="c-main"><b className="c-name">{q.customer.name}</b><div className="sub">{q.items.map((i) => i.description).join(", ")}</div></td>
                  <td className="num c-end">{money(q.totals.total, business.currency)}</td>
                  <td className="c-stat"><QuotePill q={q} /></td>
                  <td className="sub c-stat" data-label="Opened">{q.view_count ? `${q.view_count}× · last ${fmtDateTime(q.views[q.views.length - 1])}` : "Not yet"}</td>
                  <td className="c-acts">
                    <div className="acts">
                      <Link className="btn sm" href={`/quotes/${q.id}`}>Open</Link>
                      {q.status === "accepted" && !q.service_record_id && (
                        <Link className="btn sm primary" href={`/appointments?quote=${q.id}`}>Book</Link>
                      )}
                      {q.service_record_id && <Pill status="done" label="Done" />}
                    </div>
                  </td>
                </tr>
              ))}
              {!quotes.length && <tr><td colSpan={6} className="empty">No quotes yet. <Link href="/quotes/new">Create your first quote</Link>.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
