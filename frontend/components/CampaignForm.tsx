"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { blankRow, cleanRows, ItemsEditor, Totals, type Row } from "@/components/ItemsEditor";
import { useSession } from "@/components/session";
import { ChannelIcon, StepCard } from "@/components/QuoteCampaign";
import { useCategories } from "@/components/Segments";
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
  // Where a new campaign goes (chosen in step 2; the campaign page then opens on that channel)
  const [chan, setChan] = useState<Set<Channel>>(new Set(["facebook", "instagram"]));
  const [group, setGroup] = useState("");
  const [cats] = useCategories();
  const flip = (c: Channel) => setChan((x) => { const n = new Set(x); if (n.has(c)) n.delete(c); else n.add(c); return n; });
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
      if (campaign) { toast("Campaign saved"); router.push(`/quotes/campaigns/${c.id}`); return; }
      const social = ["facebook", "instagram"].filter((x) => chan.has(x as Channel));
      const launch = social.length ? "social" : chan.has("whatsapp") ? "whatsapp" : "link";
      const qs = new URLSearchParams({ created: "1", launch, ch: [...chan].join(",") });
      if (chan.has("whatsapp") && group) qs.set("send", group);
      toast("Campaign is live. Now send it out.");
      router.push(`/quotes/campaigns/${c.id}?${qs}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const fields = (
    <>
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
    </>
  );

  if (campaign) {
    return (
      <div className="card">
        {fields}
        <div className="foot">
          <button className="btn" onClick={() => router.back()}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    );
  }
  const offered = title.trim().length >= 2 && cleanRows(rows).length > 0;
  return (
    <>
      <div className="qc-flow">
        <StepCard n={1} title="Create the offer" done={offered} sub="Name it, add what clients get and the price. The picture is designed from this.">
          {fields}
        </StepCard>
        <StepCard n={2} title="Where should it go?" done={chan.size > 0} sub="Pick one or more. You can send it to more places later from the campaign page.">
          <div className="chans">
            {CHANNELS.map((c) => (
              <label key={c.id} className={`chan${chan.has(c.id) ? " on" : ""}`}>
                <input type="checkbox" checked={chan.has(c.id)} onChange={() => flip(c.id)} />
                <span className="chan-ico">{ChannelIcon[c.id]()}</span>
                <span className="chan-t"><b>{c.label}</b><small>{c.what}</small></span>
              </label>
            ))}
          </div>
          {chan.has("whatsapp") && (
            <label className="chan-group">Which clients?
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">All clients with a mobile number</option>
                {(cats?.categories ?? []).map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
              </select>
              <span className="hint">Each client gets a personal WhatsApp message with the offer link. Make categories on the Clients page.</span>
            </label>
          )}
          <p className="small muted" style={{ margin: "12px 0 0" }}>Every campaign also gets its own link and QR code, for TikTok, Snapchat, ads and posters.</p>
        </StepCard>
      </div>
      <div className="qc-sendbar">
        <div className="qc-sendbar-sum">
          <b>{title.trim() || "Your campaign"}</b>
          <span className="small muted">{chan.size ? `Goes to: ${CHANNELS.filter((c) => chan.has(c.id)).map((c) => c.short).join(", ")}` : "Link & QR only"}</span>
        </div>
        <button className="btn" onClick={() => router.back()}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Publish & send it out"}</button>
      </div>
    </>
  );
}

type Channel = "facebook" | "instagram" | "whatsapp";
const CHANNELS: { id: Channel; label: string; short: string; what: string }[] = [
  { id: "facebook", label: "Facebook", short: "Facebook", what: "A post on your Page with the offer link" },
  { id: "instagram", label: "Instagram", short: "Instagram", what: "A post with the picture and QR code" },
  { id: "whatsapp", label: "WhatsApp to clients", short: "WhatsApp clients", what: "A personal message to all clients or one category" },
];
