"use client";

import { useRef, useState } from "react";
import { Lightbox, useAiLeft } from "@/components/QuotePicture";
import { toast } from "@/components/ui";
import { api } from "@/lib/api";

export type PicMode = "upload" | "ai" | "design";
export type DesignStyle = "bold" | "soft" | "classic";
export interface Pic {
  mode: PicMode;
  art: { id: number; preview: string | null; kind: "ai" | "upload" } | null; // the photo behind the offer
  style: DesignStyle; // when there's no photo
}

const STYLES: { id: DesignStyle; label: string; what: string }[] = [
  { id: "bold", label: "Bold", what: "Big illustration" },
  { id: "soft", label: "Soft", what: "Light and airy" },
  { id: "classic", label: "Classic", what: "Clean card" },
];

/** Step 2 of New campaign: the picture. The owner's photo, an AI picture from a description, or a ready-made design. */
export function CampaignPicture({ pic, setPic, aiDesc, setAiDesc, current }: {
  pic: Pic; setPic: (p: Pic) => void; aiDesc: string; setAiDesc: (s: string) => void;
  current?: string | null; // the campaign's picture now (editing), shown until a new one is picked
}) {
  const [left, setLeft] = useAiLeft();
  const [busy, setBusy] = useState<"upload" | "ai" | null>(null);
  const [big, setBig] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const aiOff = left === null;
  const artOf = (k: "ai" | "upload") => (pic.art?.kind === k ? pic.art : null);

  async function upload(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast("Pick a photo (JPG, PNG or WebP).");
    setBusy("upload");
    try {
      const m = await api.upload<{ id: number }>("/media", f);
      setPic({ ...pic, mode: "upload", art: { id: m.id, preview: URL.createObjectURL(f), kind: "upload" } });
    } catch (e) { toast((e as Error).message); }
    setBusy(null);
  }
  async function generate() {
    if (aiDesc.trim().length < 3) return toast("Describe the picture first.");
    setBusy("ai");
    try {
      const r = await api.post<{ id: number; preview: string; ai_left: number | null }>("/media/ai", { description: aiDesc.trim() });
      setPic({ ...pic, mode: "ai", art: { id: r.id, preview: r.preview, kind: "ai" } });
      setLeft(r.ai_left ?? null);
      toast("AI picture ready. Create the campaign to see it with your offer on top.");
    } catch (e) { toast((e as Error).message); }
    setBusy(null);
  }

  return (
    <div className="cpic">
      <div className="cpic-modes" role="radiogroup" aria-label="Campaign picture">
        <button type="button" role="radio" aria-checked={pic.mode === "upload"} className="cpic-mode" onClick={() => setPic({ ...pic, mode: "upload" })}>
          <span className="cpic-ico" aria-hidden="true">{ICON.upload}</span>
          <b>Upload image</b><small>Your own photo of the salon, a result or a product</small>
        </button>
        <button type="button" role="radio" aria-checked={pic.mode === "ai"} className="cpic-mode ai" onClick={() => setPic({ ...pic, mode: "ai" })}>
          <span className="cpic-ico" aria-hidden="true">{ICON.ai}</span>
          <b>Generate AI image</b><small>{aiOff ? "Not switched on for your account" : left === undefined ? "Describe it, AI paints it" : `Describe it, AI paints it · ${left} left this month`}</small>
        </button>
        <button type="button" role="radio" aria-checked={pic.mode === "design"} className="cpic-mode" onClick={() => setPic({ ...pic, mode: "design" })}>
          <span className="cpic-ico" aria-hidden="true">{ICON.design}</span>
          <b>Ready-made design</b><small>No photo needed, free</small>
        </button>
      </div>

      <div className="cpic-body">
        {pic.mode === "upload" && (
          <div className="cpic-up">
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            {artOf("upload")?.preview ? (
              <Thumb src={artOf("upload")!.preview!} onOpen={setBig} />
            ) : (
              <button type="button" className="cpic-drop" disabled={busy === "upload"} onClick={() => file.current?.click()}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}>
                <span aria-hidden="true">{ICON.upload}</span>
                <b>{busy === "upload" ? "Uploading…" : "Choose a photo"}</b>
                <small>or drop it here · JPG, PNG or WebP, up to 10 MB</small>
              </button>
            )}
            <div className="cpic-side">
              <p className="small">Your photo goes behind the offer. We add your salon name, the price and a QR code on top, so keep the main subject near the top.</p>
              {artOf("upload") && <button type="button" className="btn sm" onClick={() => file.current?.click()}>{busy === "upload" ? "Uploading…" : "Choose another photo"}</button>}
            </div>
          </div>
        )}

        {pic.mode === "ai" && (aiOff ? (
          <p className="note">AI pictures aren&apos;t switched on for your account. Upload a photo or use a ready-made design instead.</p>
        ) : (
          <div className="cpic-ai">
            <label className="full">Describe the picture
              <textarea rows={3} maxLength={400} value={aiDesc} onChange={(e) => setAiDesc(e.target.value)}
                placeholder="e.g. Luxury facial room with a jade roller, glass serum bottles and white orchids, soft warm light" />
              <span className="hint">{aiDesc ? "Filled in from your offer. Change any words you like." : "Say what's in the scene, the mood and the colours."} No text needed: your name, offer and price are added on top.</span>
            </label>
            <div className="cpic-ai-row">
              {artOf("ai")?.preview && <Thumb src={artOf("ai")!.preview!} onOpen={setBig} />}
              <div className="cpic-side">
                <button type="button" className="btn primary" disabled={busy === "ai" || left === 0} onClick={generate}>
                  {busy === "ai" ? "Painting your picture…" : artOf("ai") ? "✨ Try another" : "✨ Generate picture"}
                </button>
                <span className="small muted">{left === 0 ? "You've used this month's AI pictures. Upload a photo or use a ready-made design." : "Takes about 20 seconds. Each try uses one AI picture."}</span>
              </div>
            </div>
          </div>
        ))}

        {pic.mode === "design" && (
          <div className="cpic-styles" role="radiogroup" aria-label="Design">
            {STYLES.map((s) => (
              <button type="button" key={s.id} role="radio" aria-checked={pic.style === s.id} className={`cpic-style st-${s.id}`} onClick={() => setPic({ ...pic, style: s.id })}>
                <i aria-hidden="true" /><b>{s.label}</b><small>{s.what}</small>
              </button>
            ))}
            <p className="small muted">Designed from your offer: the illustration and colours follow the services. You can shuffle it after.</p>
          </div>
        )}
        {current && pic.mode !== "design" && !artOf(pic.mode === "ai" ? "ai" : "upload") && (
          <p className="small muted" style={{ margin: "10px 0 0" }}>Keeping the current picture until you pick a new one.</p>
        )}
      </div>
      {big && <Lightbox src={big} alt="Campaign picture" onClose={() => setBig(null)} />}
    </div>
  );
}

function Thumb({ src, onOpen }: { src: string; onOpen: (s: string) => void }) {
  return (
    <button type="button" className="cpic-thumb" onClick={() => onOpen(src)} aria-label="See the picture full size">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" />
      <span>View</span>
    </button>
  );
}

const S = { viewBox: "0 0 24 24", width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICON = {
  upload: <svg {...S}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>,
  ai: <svg {...S}><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4z" /><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>,
  design: <svg {...S}><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h5M8 16.5h3" /></svg>,
};
