"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Quote } from "@/lib/types";

export interface Picked { id: number; name: string; is_pdf: boolean; preview: string | null; ai?: boolean }

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const ACCEPT_IMG = "image/jpeg,image/png,image/webp";

let aiCache: number | null | undefined;
/** AI pictures left this month, or null when AI isn't set up. */
export function useAiLeft(): [number | null | undefined, (n: number | null) => void] {
  const [left, setLeft] = useState<number | null | undefined>(aiCache);
  useEffect(() => {
    if (aiCache !== undefined) return;
    api.get<{ ai_left: number } | null>("/media/ai").then((r) => { aiCache = r ? r.ai_left : null; setLeft(aiCache); }).catch(() => setLeft(null));
  }, []);
  return [left, (n) => { aiCache = n; setLeft(n); }];
}

/** Describe the picture (and optionally add a reference photo); AI makes it. */
function AiForm({ busy, left, hint, onMake, onCancel }: {
  busy: boolean; left: number; hint?: string; onMake: (description: string, referenceId: number | null) => void; onCancel?: () => void;
}) {
  const [desc, setDesc] = useState("");
  const [ref, setRef] = useState<{ id: number; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function pickRef(f: File | undefined) {
    if (!f) return;
    setUploading(true);
    try {
      const m = await api.upload<{ id: number }>("/media", f);
      setRef({ id: m.id, preview: URL.createObjectURL(f) });
    } catch (e) { toast((e as Error).message); }
    setUploading(false);
  }
  return (
    <div className="aiform">
      <label className="full">Describe the picture
        <textarea rows={3} maxLength={400} value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="e.g. Luxury hydra-facial room with gold mask, glass serum bottles and white orchids, soft warm light" />
        {hint && <span className="hint">{hint}</span>}
      </label>
      <div className="aiform-ref">
        <input ref={input} type="file" accept={ACCEPT_IMG} hidden onChange={(e) => { pickRef(e.target.files?.[0]); e.target.value = ""; }} />
        {ref ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ref.preview} alt="" />
            <span>AI will follow this photo.</span>
            <button type="button" className="btn sm ghost" onClick={() => setRef(null)}>Remove</button>
          </>
        ) : (
          <button type="button" className="btn sm" disabled={uploading} onClick={() => input.current?.click()}>
            {uploading ? "Uploading…" : "+ Reference photo (optional)"}
          </button>
        )}
      </div>
      <div className="acts" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="btn primary sm" disabled={busy || left === 0 || (!desc.trim() && !hint)} onClick={() => onMake(desc.trim(), ref?.id ?? null)}>
          {busy ? "Creating picture… (10–20 s)" : `✨ Create picture · ${left} left this month`}
        </button>
        {onCancel && <button type="button" className="btn sm ghost" onClick={onCancel}>Cancel</button>}
      </div>
      {ref && <p className="hint" style={{ margin: 0 }}>With a reference photo the AI picture costs a little more, but still counts as one of this month&apos;s pictures.</p>}
    </div>
  );
}

/** While writing a new quote: optionally attach a file, or create a picture with AI. */
export function AttachField({ value, onChange }: { value: Picked | null; onChange: (p: Picked | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"upload" | "ai">("upload");
  const [left, setLeft] = useAiLeft();
  async function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast("That file is over 10 MB. Use a smaller picture or PDF.");
    setBusy(true);
    try {
      const m = await api.upload<{ id: number; name: string; is_pdf: boolean }>("/media", f);
      onChange({ ...m, preview: m.is_pdf ? null : URL.createObjectURL(f) });
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }
  async function make(description: string, referenceId: number | null) {
    setBusy(true);
    try {
      const r = await api.post<{ id: number; preview: string; ai_left: number }>("/media/ai", { description, reference_id: referenceId });
      setLeft(r.ai_left);
      onChange({ id: r.id, name: "AI picture", is_pdf: false, preview: r.preview, ai: true });
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  return (
    <div className="attach">
      <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => pick(e.target.files?.[0])} />
      {value ? (
        <div className="attach-has">
          {value.preview
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={value.preview} alt="" />
            : <span className="attach-pdf" aria-hidden="true">PDF</span>}
          <span className="attach-name"><b>{value.name}</b><small>Sent with the quote. Clients see it on their quote page and in the WhatsApp preview.</small></span>
          {value.ai
            ? <button type="button" className="btn sm" onClick={() => { setMode("ai"); onChange(null); }}>Try another</button>
            : <button type="button" className="btn sm" onClick={() => input.current?.click()} disabled={busy}>Replace</button>}
          <button type="button" className="btn sm ghost danger" onClick={() => onChange(null)}>Remove</button>
        </div>
      ) : (
        <>
          {left !== null && left !== undefined && (
            <div className="seg attach-tabs" role="tablist" aria-label="Picture">
              <button type="button" role="tab" aria-selected={mode === "upload"} aria-pressed={mode === "upload"} onClick={() => setMode("upload")}>Upload a file</button>
              <button type="button" role="tab" aria-selected={mode === "ai"} aria-pressed={mode === "ai"} onClick={() => setMode("ai")}>✨ Create with AI</button>
            </div>
          )}
          {mode === "ai" && left !== null && left !== undefined ? (
            <AiForm busy={busy} left={left} onMake={make} />
          ) : (
            <button type="button" className="attach-drop" onClick={() => input.current?.click()} disabled={busy}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
              <b>{busy ? "Uploading…" : "Attach a picture or brochure"}</b>
              <small>JPG, PNG, WebP or PDF, up to 10 MB. Optional. Or make a picture from the quote after saving.</small>
            </button>
          )}
        </>
      )}
    </div>
  );
}

const STYLES: { id: Quote["design_style"]; label: string }[] = [
  { id: "none", label: "No picture" },
  { id: "upload", label: "My file" },
  { id: "bold", label: "Bold" },
  { id: "soft", label: "Soft" },
  { id: "classic", label: "Classic" },
  { id: "photo", label: "AI picture" },
];

/** On a saved quote: the picture sent with it on WhatsApp (uploaded, designed from the quote, or AI). All optional. */
export function QuotePicture({ q, onChange }: { q: Quote; onChange: (q: Quote) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const hasItems = q.items.length > 0;
  const open = q.status === "sent" || q.status === "viewed";

  async function run(key: string, f: () => Promise<Quote>, done?: string) {
    setBusy(key);
    try { onChange(await f()); if (done) toast(done); return true; } catch (e) { toast((e as Error).message); return false; } finally { setBusy(null); }
  }
  const style = (s: Quote["design_style"]) => run(s, () => api.patch<Quote>(`/quotes/${q.id}/design`, { style: s }));
  const upload = (f: File | undefined) => f && run("upload", () => api.upload<Quote>(`/quotes/${q.id}/attachment`, f), "Attached. It goes with the quote.");
  const makeAi = async (description: string, referenceId: number | null) => {
    if (await run("ai", () => api.post<Quote>(`/quotes/${q.id}/design/ai`, { description: description || null, reference_id: referenceId }), "AI picture ready.")) setAiOpen(false);
  };

  const available = STYLES.filter((s) => s.id === "none" || (s.id === "upload" ? !!q.attachment : s.id === "photo" ? q.has_ai_art : hasItems));
  return (
    <section className="panel qpic">
      <h2>Picture for WhatsApp <span className="muted small">optional</span></h2>
      <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="qpic-grid">
        <div className="qpic-preview">
          {q.picture_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={q.picture_url} alt={`Picture for ${q.label}`} />
            : q.design_style === "upload" && q.attachment?.is_pdf
              ? <a className="qpic-pdf" href={q.attachment.url} target="_blank" rel="noreferrer"><span>PDF</span>{q.attachment.name}</a>
              : <div className="qpic-empty">No picture. The quote is sent as a link with your items and prices.</div>}
        </div>
        <div className="qpic-tools">
          {hasItems && q.theme && <span className="sp-theme">Design from your quote · <b>{q.theme}</b></span>}
          <div className="sp-styles" role="radiogroup" aria-label="Picture">
            {available.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={q.design_style === s.id} disabled={!!busy || !open}
                className={`sp-style st-${s.id}`} onClick={() => q.design_style !== s.id && style(s.id)}>
                <i aria-hidden="true" />{s.label}
              </button>
            ))}
          </div>
          {open && !aiOpen && (
            <div className="acts" style={{ justifyContent: "flex-start" }}>
              <button className="btn sm" disabled={!!busy} onClick={() => input.current?.click()}>{busy === "upload" ? "Uploading…" : q.attachment ? "Replace my file" : "Upload picture / PDF"}</button>
              {(q.design_style === "bold" || q.design_style === "soft") && (
                <button className="btn sm" disabled={!!busy} onClick={() => run("shuffle", () => api.patch<Quote>(`/quotes/${q.id}/design`, { shuffle: true }))}>↻ Shuffle</button>
              )}
              {q.ai_left !== null && (
                <button className="btn sm" disabled={!!busy || q.ai_left === 0} onClick={() => setAiOpen(true)}>✨ Create with AI · {q.ai_left} left</button>
              )}
              {q.design_style === "upload" && q.attachment && <a className="btn sm" href={q.attachment.url} target="_blank" rel="noreferrer">Open {q.attachment.is_pdf ? "brochure" : "file"}</a>}
            </div>
          )}
          {open && aiOpen && q.ai_left !== null && (
            <AiForm busy={busy === "ai"} left={q.ai_left} onMake={makeAi} onCancel={() => setAiOpen(false)}
              hint={hasItems ? "Leave empty to make it from your services. Your prices and the QR code are added on top." : undefined} />
          )}
          <p className="note" style={{ margin: 0 }}>When you press Send on WhatsApp, your client sees this picture as the link preview.</p>
        </div>
      </div>
    </section>
  );
}
