"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { blankRow, cleanRows, ItemsEditor, Totals, type Row } from "@/components/ItemsEditor";
import { useSession } from "@/components/session";
import { ErrorBox, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { addDays, todayUAE } from "@/lib/format";
import type { Campaign, CatalogItem } from "@/lib/types";
import { duration } from "@/lib/vocab";

export function CampaignForm({ campaign }: { campaign?: Campaign }) {
  const router = useRouter();
  const { business } = useSession();
  const [title, setTitle] = useState(campaign?.title ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [rows, setRows] = useState<Row[]>(campaign ? campaign.items.map((i) => ({ description: i.description, quantity: String(Number(i.quantity)), unit_price: String(Number(i.unit_price)) })) : [{ ...blankRow }]);
  const [discount, setDiscount] = useState(campaign ? String(Number(campaign.totals.discount)) : "0");
  const [vat, setVat] = useState(campaign?.vat_rate ?? business.default_vat_rate);
  const [until, setUntil] = useState(campaign?.valid_until ?? addDays(todayUAE(), 30));
  const [minutes, setMinutes] = useState(campaign ? String(campaign.duration_min) : "");
  const [notes, setNotes] = useState(campaign?.notes ?? "");
  const [menu, setMenu] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onMenu = useCallback((m: CatalogItem[]) => setMenu(m), []);
  const byName = new Map(menu.map((c) => [c.name.trim().toLowerCase(), c.duration_min ?? 0]));
  const guess = rows.reduce((a, r) => a + (byName.get(r.description.trim().toLowerCase()) ?? 0) * (Number(r.quantity) || 1), 0);

  async function save() {
    const items = cleanRows(rows);
    if (title.trim().length < 2) return setError("Give the offer a name clients will recognise.");
    if (!items.length) return setError("Add at least one service with a price.");
    setBusy(true);
    setError(null);
    const body = {
      title: title.trim(), description: description.trim() || null, items, discount: Number(discount) || 0, vat_rate: Number(vat),
      valid_until: until || null, duration_min: Number(minutes) || guess || 60, notes: notes.trim() || null, active: campaign?.active ?? true,
    };
    try {
      const c = campaign ? await api.put<Campaign>(`/campaigns/${campaign.id}`, body) : await api.post<Campaign>("/campaigns", body);
      toast(campaign ? "Campaign saved" : "Campaign is live. Post it to your social media now.");
      router.push(campaign ? `/quotes/campaigns/${c.id}` : `/quotes/campaigns/${c.id}?created=1#post`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <div className="card">
      <ErrorBox error={error} />
      <div className="form" style={{ marginTop: error ? 12 : 0 }}>
        <label className="full">Offer name<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bridal glow package" maxLength={120} /></label>
        <label className="full">What clients get <span className="hint">(shown on the offer page)</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Bridal hair & makeup on the day, plus a trial session the week before." /></label>
        <ItemsEditor rows={rows} setRows={setRows} onMenu={onMenu} />
        <label>Discount ({business.currency})<input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
        <label>VAT %<input type="number" min="0" max="100" step="0.5" value={vat} onChange={(e) => setVat(e.target.value)} /></label>
        <label>Offer ends<input type="date" min={todayUAE()} value={until ?? ""} onChange={(e) => setUntil(e.target.value)} /></label>
        <label>Appointment length (minutes)<input type="number" min="15" max="600" step="15" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder={guess ? `${guess} (from your menu)` : "60"} />
          <span className="hint">Clients can only pick times when someone is free for {duration(Number(minutes) || guess || 60)}.</span>
        </label>
        <label className="full">Terms <span className="hint">(optional)</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="50% deposit confirms your date. Free reschedule up to 48 hours before." /></label>
      </div>
      <Totals rows={rows} discount={discount} vat={vat} />
      <div className="foot">
        <button className="btn" onClick={() => router.back()}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : campaign ? "Save changes" : "Publish campaign"}</button>
      </div>
    </div>
  );
}
