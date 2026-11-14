"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { CampaignPicture, type DesignStyle, type Pic } from "@/components/CampaignPicture";
import { CampaignPreview } from "@/components/CampaignPreview";
import { blankRow, cleanRows, ItemsEditor, Totals, type Row } from "@/components/ItemsEditor";
import { useSession } from "@/components/session";
import { ChannelIcon, StepCard } from "@/components/QuoteCampaign";
import { useCategories } from "@/components/Segments";
import { type Applied, TemplateStrip, useMyTemplates } from "@/components/TemplateLibrary";
import { ErrorBox, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { addDays, todayUAE } from "@/lib/format";
import type { Campaign, CatalogItem } from "@/lib/types";
import { duration } from "@/lib/vocab";

export function CampaignForm({ campaign, template }: { campaign?: Campaign; template?: string | null }) {
  const router = useRouter();
  const { business } = useSession();
  const [title, setTitle] = useState(campaign?.title ?? "");
  const [headline, setHeadline] = useState(campaign?.headline ?? "");
  const [applied, setApplied] = useState<Applied | null>(null);
  const [manual, setManual] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [mine, reloadMine] = useMyTemplates();
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [rows, setRows] = useState<Row[]>(campaign ? campaign.items.map((i) => ({ description: i.description, quantity: String(Number(i.quantity)), unit_price: String(Number(i.unit_price)) })) : [{ ...blankRow }]);
  const [discount, setDiscount] = useState(campaign ? String(Number(campaign.totals.discount)) : "0");
  const [vat, setVat] = useState(campaign?.vat_rate ?? business.default_vat_rate);
  const [until, setUntil] = useState(campaign?.valid_until ?? addDays(todayUAE(), 30));
  const [minutes, setMinutes] = useState(campaign ? String(campaign.duration_min) : "");
  const [notes, setNotes] = useState(campaign?.notes ?? "");
  const [menu, setMenu] = useState<CatalogItem[]>([]);
  // The picture (step 2) and the campaign made from it, shown as a preview before publishing
  const [pic, setPicRaw] = useState<Pic>(() => campaign?.design_style === "photo" && campaign.art_id
    ? { mode: campaign.art_kind === "upload" ? "upload" : "ai", art: null, style: "bold" }
    : { mode: "design", art: null, style: (["bold", "soft", "classic"].includes(campaign?.design_style ?? "") ? campaign!.design_style : "bold") as DesignStyle });
  const [aiDesc, setAiDesc] = useState(() => campaign
    ? `${campaign.title}: ${campaign.items.slice(0, 4).map((i) => i.description).join(", ")}. Elegant salon setting, soft natural light, calm premium colours` : "");
  const [aiTouched, setAiTouched] = useState(false);
  const [made, setMade] = useState<Campaign | null>(campaign ?? null);
  const [madeKey, setMadeKey] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  // Where a new campaign goes (step 3; the campaign page then opens on that channel)
  const [chan, setChan] = useState<Set<Channel>>(new Set(["facebook", "instagram"]));
  const [group, setGroup] = useState("");
  const [cats] = useCategories();
  const flip = (c: Channel) => setChan((x) => { const n = new Set(x); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const [error, setError] = useState<string | null>(null);
  const [picError, setPicError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuReady, setMenuReady] = useState(false);
  const onMenu = useCallback((m: CatalogItem[]) => { setMenu(m); setMenuReady(true); }, []);
  const byName = new Map(menu.map((c) => [c.name.trim().toLowerCase(), c.duration_min ?? 0]));
  const guess = rows.reduce((a, r) => a + (byName.get(r.description.trim().toLowerCase()) ?? 0) * (Number(r.quantity) || 1), 0);

  // A starting description for the AI picture, from the offer itself
  const autoDesc = () => {
    const svc = rows.map((r) => r.description.trim()).filter(Boolean).slice(0, 4).join(", ");
    return title.trim() ? `${title.trim()}${svc ? `: ${svc}` : ""}. Elegant salon setting, soft natural light, calm premium colours` : "";
  };
  function setPic(p: Pic) {
    if (p.mode === "ai" && !aiDesc.trim()) setAiDesc(applied?.image ?? autoDesc());
    setPicRaw(p);
    setPicError(null);
  }

  function apply(a: Applied) {
    setApplied(a);
    setManual(false);
    setTitle(a.title); setHeadline(a.headline); setDescription(a.description);
    setRows(a.rows.length ? a.rows : [{ ...blankRow }]);
    setDiscount(a.discount ?? "0"); setMinutes(a.minutes ?? ""); setNotes(a.notes ?? "");
    if (!aiTouched) setAiDesc(a.image ?? "");
    setError(null);
  }
  function clearTemplate() {
    setApplied(null);
    setTitle(""); setHeadline(""); setDescription(""); setRows([{ ...blankRow }]); setDiscount("0"); setMinutes(""); setNotes("");
    if (!aiTouched) setAiDesc("");
  }
  function writeOwn() {
    setManual(true);
    setTimeout(() => { nameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); nameRef.current?.focus({ preventScroll: true }); }, 50);
  }
  // Services typed (or from a template) with no price yet
  const unpriced = rows.filter((r) => r.description.trim() && r.unit_price === "").map((r) => r.description.trim());

  async function saveTemplate() {
    const services = rows.filter((r) => r.description.trim()).map((r) => ({
      description: r.description.trim(), quantity: Number(r.quantity) || 1, unit_price: r.unit_price === "" ? null : Number(r.unit_price),
    }));
    if (title.trim().length < 2) return toast("Give the offer a name first: it becomes the template's name.");
    if (!services.length) return toast("Add at least one service first.");
    setSaving(true);
    try {
      const replaced = (mine ?? []).some((x) => x.name.trim().toLowerCase() === title.trim().toLowerCase());
      await api.post("/campaigns/templates", {
        name: title.trim(), headline: headline.trim() || null, description: description.trim() || null, services,
        category: applied?.from.category ?? null, audience: applied?.from.audience ?? [],
        discount: Number(discount) || 0, duration_min: Number(minutes) || null, notes: notes.trim() || null,
        image_prompt: (aiDesc.trim() || applied?.image || "").slice(0, 400) || null,
      });
      reloadMine();
      toast(replaced ? `“${title.trim()}” updated in My templates` : `Saved to My templates. Find it under Browse templates next time.`);
    } catch (e) { toast((e as Error).message); }
    setSaving(false);
  }

  /** What's wrong with the offer, if anything. */
  function offerProblem(): string | null {
    if (title.trim().length < 2) return "Give the offer a name clients will recognise.";
    if (unpriced.length) return `Add your price for ${unpriced.join(", ")}, or remove ${unpriced.length === 1 ? "it" : "them"}.`;
    if (!cleanRows(rows).length) return "Add at least one service with a price.";
    return null;
  }
  // The photo for the chosen way (an upload, or an AI picture), new or already in the campaign
  const kind = pic.mode === "ai" ? "ai" : "upload";
  const curArt = pic.mode !== "design" && pic.art?.kind === kind ? pic.art : null;
  const hasPhoto = !!curArt || (pic.mode !== "design" && !!made?.art_id && made.design_style === "photo" && made.art_kind === kind);
  function picProblem(): string | null {
    if (pic.mode === "upload" && !hasPhoto) return "Choose a photo to upload, or pick a ready-made design.";
    if (pic.mode === "ai" && !hasPhoto) return "Generate the AI picture first, or pick a ready-made design.";
    return null;
  }
  const body = () => ({
    title: title.trim(), headline: headline.trim() || null, description: description.trim() || null, items: cleanRows(rows), discount: Number(discount) || 0, vat_rate: Number(vat),
    valid_until: until || null, duration_min: Number(minutes) || guess || 60, notes: notes.trim() || null, active: made?.active ?? true,
    art_id: curArt ? curArt.id : null,
    style: pic.mode === "design" ? pic.style : hasPhoto ? "photo" : null,
  });
  // What the preview was made from (the picture counts once it's part of the campaign)
  const key = JSON.stringify({ ...body(), active: null, art_id: pic.mode !== "design" ? curArt?.id ?? (hasPhoto ? made?.art_id : null) ?? null : null });
  const stale = !!made && !!madeKey && madeKey !== key;

  function fail(msg: string, where: "offer" | "pic") {
    if (where === "offer") { setError(msg); document.getElementById("step-1")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else { setPicError(msg); document.getElementById("step-2")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }

  /** "Create campaign": saves it as a draft and shows how it looks. */
  async function createCampaign() {
    const o = offerProblem(); if (o) return fail(o, "offer");
    const p = picProblem(); if (p) return fail(p, "pic");
    setError(null); setPicError(null); setMaking(true);
    try {
      const c = made ? await api.put<Campaign>(`/campaigns/${made.id}`, body()) : await api.post<Campaign>("/campaigns", { ...body(), draft: true });
      setMade(c); setMadeKey(key);
      setTimeout(() => document.getElementById("cprev-made")?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    } catch (e) { setPicError((e as Error).message); }
    setMaking(false);
  }
  async function shuffle() {
    if (!made) return;
    setMaking(true);
    try { const c = await api.patch<Campaign>(`/campaigns/${made.id}/design`, { shuffle: true }); setMade(c); setMadeKey(key); }
    catch (e) { toast((e as Error).message); }
    setMaking(false);
  }

  /** New: publish (making it first if needed). Editing: save changes. */
  async function save() {
    const o = offerProblem(); if (o) return fail(o, "offer");
    const p = picProblem(); if (p) return fail(p, "pic");
    setBusy(true); setError(null); setPicError(null);
    try {
      if (campaign) {
        const c = await api.put<Campaign>(`/campaigns/${campaign.id}`, body());
        toast("Campaign saved"); router.push(`/quotes/campaigns/${c.id}`); return;
      }
      const c = made ? await api.put<Campaign>(`/campaigns/${made.id}`, { ...body(), active: true, draft: false })
        : await api.post<Campaign>("/campaigns", { ...body(), draft: false });
      const social = ["facebook", "instagram"].filter((x) => chan.has(x as Channel));
      const launch = social.length ? "social" : chan.has("whatsapp") ? "whatsapp" : "link";
      const qs = new URLSearchParams({ created: "1", launch, ch: [...chan].join(",") });
      if (chan.has("whatsapp") && group) qs.set("send", group);
      toast("Campaign is live. Now send it out.");
      router.push(`/quotes/campaigns/${c.id}?${qs}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const offered = !offerProblem();
  const pictured = !!made && !stale;
  // Label with its hint on the same line, so side-by-side boxes line up
  const lab = (l: string, h: string) => <span className="lbl">{l} <span className="hint-inline">({h})</span></span>;

  const fields = (
    <>
      <ErrorBox error={error} />
      <div className="form" style={{ marginTop: error ? 12 : 0 }}>
        <label>Offer name<input ref={nameRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bridal glow package" maxLength={120} /></label>
        <label>{lab("Headline", "the hook on the picture and posts")}<input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Glow beautifully on your big day!" maxLength={120} /></label>
        <label className="full">{lab("What clients get", "shown on the offer page")}<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Bridal hair & makeup on the day, plus a trial session the week before." /></label>
        <ItemsEditor rows={rows} setRows={setRows} onMenu={onMenu} />
        <label>Discount ({business.currency})<input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
        <label>VAT %<input type="number" min="0" max="100" step="0.5" value={vat} onChange={(e) => setVat(e.target.value)} /></label>
        <label>Offer ends<input type="date" min={todayUAE()} value={until ?? ""} onChange={(e) => setUntil(e.target.value)} /></label>
        <label>{lab("Appointment length", "minutes")}<input type="number" min="15" max="600" step="15" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder={guess ? `${guess} (from your menu)` : "60"} />
          <span className="hint">Clients can only pick times when someone is free for {duration(Number(minutes) || guess || 60)}.</span>
        </label>
        <label className="full">{lab("Terms", "optional")}<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="50% deposit confirms your date. Free reschedule up to 48 hours before." /></label>
      </div>
      <Totals rows={rows} discount={discount} vat={vat} />
      <div className="tpl-save">
        <button type="button" className="btn sm ghost" onClick={saveTemplate} disabled={saving}>{saving ? "Saving…" : "☆ Save as my template"}</button>
        <span className="small muted">Keep this offer to send again, for Eid, Ramadan or every month.</span>
      </div>
    </>
  );

  const pictureStep = (
    <StepCard n={2} title={campaign ? "The campaign picture" : "Create campaign"} done={pictured}
      sub={campaign ? "Change the picture, then save. Your salon name, offer, price and QR code are always on top." : "Add a picture, then create the campaign to see exactly how it looks, with your salon name, offer, price and QR code."}>
      <CampaignPicture pic={pic} setPic={setPic} aiDesc={aiDesc} setAiDesc={(s) => { setAiDesc(s); setAiTouched(true); }} current={campaign?.art_id ? "yes" : null} />
      <ErrorBox error={picError} />
      {!campaign && (
        <div className="cmake">
          <button type="button" className="btn primary cmake-go" disabled={making} onClick={createCampaign}>
            {making ? "Creating…" : !made ? "Create campaign" : stale ? "Update campaign" : "✓ Campaign created"}
          </button>
          <span className="small muted">{!made ? "Saved as a draft. Nothing is posted or sent until you publish." : stale ? "You changed the offer or picture. Update to see it." : "Looks good? Choose where it goes below, then publish."}</span>
        </div>
      )}
      {made && (
        <div className={`cmade${stale ? " is-stale" : ""}`} id="cprev-made">
          <CampaignPreview c={made} as="post" />
          <div className="cmade-side">
            <h3>{campaign ? "The campaign now" : "Your campaign"}</h3>
            <p className="small muted">{campaign ? "Save to see your changes on the campaign page." : "This is what clients see on Facebook and Instagram. The same picture goes on WhatsApp and the offer link."}</p>
            {made.design_style !== "photo" && <button type="button" className="btn sm" disabled={making} onClick={shuffle}>↻ Shuffle the design</button>}
            {stale && !campaign && <button type="button" className="btn sm primary" disabled={making} onClick={createCampaign}>Update campaign</button>}
          </div>
        </div>
      )}
    </StepCard>
  );

  if (campaign) {
    return (
      <>
        <div className="qc-flow">
          <StepCard n={1} title="The offer" done={offered}>{fields}</StepCard>
          {pictureStep}
        </div>
        <div className="qc-sendbar">
          <div className="qc-sendbar-sum"><b>{title.trim() || "Your campaign"}</b><span className="small muted">Changes apply to new clients</span></div>
          <button className="btn" onClick={() => router.push(`/quotes/campaigns/${campaign.id}`)}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="qc-flow">
        <StepCard n={1} title="Create the offer" done={offered} sub="Use a ready-made template or write your own. Everything stays editable.">
          <TemplateStrip menu={menu} applied={applied} onApply={apply} onClear={clearTemplate} mine={mine} reloadMine={reloadMine}
            initial={menuReady ? template : null} manual={manual} onManual={writeOwn} />
          {fields}
        </StepCard>
        {pictureStep}
        <StepCard n={3} title="Where should it go?" done={chan.size > 0} sub="Pick one or more. You can send it to more places later from the campaign page.">
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
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? "Publishing…" : "Publish & send it out"}</button>
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
