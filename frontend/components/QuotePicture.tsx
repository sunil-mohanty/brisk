"use client";

import { useRef, useState } from "react";
import { toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Quote } from "@/lib/types";

export interface Picked { id: number; name: string; is_pdf: boolean; preview: string | null }

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

/** While writing a new quote: optionally attach a picture or PDF brochure from this computer. */
export function AttachField({ value, onChange }: { value: Picked | null; onChange: (p: Picked | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
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
          <button type="button" className="btn sm" onClick={() => input.current?.click()} disabled={busy}>Replace</button>
          <button type="button" className="btn sm ghost danger" onClick={() => onChange(null)}>Remove</button>
        </div>
      ) : (
        <button type="button" className="attach-drop" onClick={() => input.current?.click()} disabled={busy}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
          <b>{busy ? "Uploading…" : "Attach a picture or brochure"}</b>
          <small>JPG, PNG, WebP or PDF, up to 10 MB. Optional. Or make a picture from the quote after saving.</small>
        </button>
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
  { id: "photo", label: "AI photo" },
];

/** On a saved quote: the picture to send on WhatsApp (uploaded, designed from the quote, or AI). All optional. */
export function QuotePicture({ q, onChange, shareText }: { q: Quote; onChange: (q: Quote) => void; shareText: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const hasItems = q.items.length > 0;
  const open = q.status === "sent" || q.status === "viewed";

  async function run(key: string, f: () => Promise<Quote>, done?: string) {
    setBusy(key);
    try { onChange(await f()); if (done) toast(done); } catch (e) { toast((e as Error).message); }
    setBusy(null);
  }
  const style = (s: Quote["design_style"]) => run(s, () => api.patch<Quote>(`/quotes/${q.id}/design`, { style: s }));
  const upload = (f: File | undefined) => f && run("upload", () => api.upload<Quote>(`/quotes/${q.id}/attachment`, f), "Attached. It goes with the quote.");

  async function share() {
    if (!q.picture_url) return;
    try {
      const blob = await (await fetch(q.picture_url)).blob();
      const file = new File([blob], `${q.label}.jpg`, { type: blob.type || "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      toast("Picture downloaded. The WhatsApp message also shows it as the link preview.");
    } catch { /* cancelled */ }
  }

  const available = STYLES.filter((s) => s.id === "none" || (s.id === "upload" ? !!q.attachment || q.design_style === "upload" : s.id === "photo" ? q.has_ai_art : hasItems));
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
          {open && (
            <div className="acts" style={{ justifyContent: "flex-start" }}>
              <button className="btn sm" disabled={!!busy} onClick={() => input.current?.click()}>{busy === "upload" ? "Uploading…" : q.attachment ? "Replace my file" : "Upload picture / PDF"}</button>
              {(q.design_style === "bold" || q.design_style === "soft") && (
                <button className="btn sm" disabled={!!busy} onClick={() => run("shuffle", () => api.patch<Quote>(`/quotes/${q.id}/design`, { shuffle: true }))}>↻ Shuffle</button>
              )}
              {hasItems && q.ai_left !== null && (
                <button className="btn sm" disabled={!!busy || q.ai_left === 0} onClick={() => run("ai", () => api.post<Quote>(`/quotes/${q.id}/design/ai`), "AI picture ready.")}>
                  {busy === "ai" ? "Creating picture…" : `✨ AI picture · ${q.ai_left} left`}
                </button>
              )}
            </div>
          )}
          {(q.picture_url || (q.design_style === "upload" && q.attachment)) && (
            <div className="acts" style={{ justifyContent: "flex-start" }}>
              {q.picture_url && <button className="btn sm wa" onClick={share}>Share picture on WhatsApp</button>}
              {q.design_style === "upload" && q.attachment && <a className="btn sm" href={q.attachment.url} target="_blank" rel="noreferrer">Open {q.attachment.is_pdf ? "brochure" : "file"}</a>}
            </div>
          )}
          <p className="note" style={{ margin: 0 }}>
            Your WhatsApp message shows this picture as the link preview. On a phone, &quot;Share picture&quot; sends the picture itself with the message.
          </p>
        </div>
      </div>
    </section>
  );
}
