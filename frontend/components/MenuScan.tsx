"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useSession } from "@/components/session";
import { toast } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { CatalogItem, ScanItem, ScanOut, ScanStatus } from "@/lib/types";

interface Row extends ScanItem { pick: boolean; price: string; minutes: string; cat: string }

/** Photos are made upright JPEGs of at most 2000 px in the browser: smaller uploads, and iPhone HEIC photos work. */
async function shrink(f: File): Promise<File> {
  if (f.type === "application/pdf" || !f.type.startsWith("image/")) return f;
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.86));
    return blob ? new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch { return f; }
}

/**
 * Reads the salon's existing printed menu: photos or a PDF in, services and packages out.
 * The owner checks the prices and names, unticks what they don't want, and adds the rest in one go.
 */
export function MenuScan({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (items: CatalogItem[]) => void }) {
  const { business } = useSession();
  const [st, setSt] = useState<ScanStatus | null>(null);
  const [files, setFiles] = useState<{ file: File; url: string | null }[]>([]);
  const [busy, setBusy] = useState<"read" | "add" | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setFiles([]); setRows(null); setError(null); setCurrency(null);
    api.get<ScanStatus>("/catalog/scan").then(setSt).catch(() => setSt({ enabled: false, left: null, per_month: 0 }));
  }, [open]);

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const ok = [...list].filter((f) => f.type.startsWith("image/") || f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (ok.length < list.length) toast("Only photos and PDFs can be read.");
    const shrunk = await Promise.all(ok.map(shrink));
    setFiles((xs) => [...xs, ...shrunk.map((file) => ({ file, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }))].slice(0, 6));
  }

  async function read() {
    setBusy("read"); setError(null);
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f.file));
    try {
      const r = await api.post<ScanOut>("/catalog/scan", fd);
      setCurrency(r.currency);
      setSt((x) => x && { ...x, left: r.left });
      setRows(r.items.map((i) => ({
        ...i, pick: !(i.existing_id && Number(i.existing_price) === Number(i.unit_price)),
        price: i.unit_price == null ? "" : String(Number(i.unit_price)), minutes: i.duration_min ? String(i.duration_min) : "",
        cat: i.category ?? (i.includes.length ? "Packages" : ""),
      })));
      if (!r.items.length) setError("No services found on it. Try a sharper photo, straight on, with the whole menu in view.");
    } catch (e) { setError((e as Error).message); }
    setBusy(null);
  }

  const picked = (rows ?? []).filter((r) => r.pick && r.name.trim());
  const noPrice = picked.filter((r) => r.price === "").length;

  async function add() {
    setBusy("add");
    try {
      const items = await api.post<CatalogItem[]>("/catalog", picked.map((r) => ({
        name: r.name.trim(), unit_price: Number(r.price) || 0, duration_min: Number(r.minutes) || null,
        category: r.cat.trim() || null, price_from: r.price_from, includes: r.includes.length ? r.includes : null,
      })));
      const pk = picked.filter((r) => r.includes.length).length;
      toast(`${picked.length} added to your menu${pk ? `, including ${pk} package${pk === 1 ? "" : "s"}` : ""}.`);
      onAdded(items);
      onClose();
    } catch (e) { setError((e as Error).message); }
    setBusy(null);
  }

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const all = !!rows?.length && rows.every((r) => r.pick);

  return (
    <Sheet open={open} onClose={onClose} wide>
      <div className="scan">
        <header className="scan-h">
          <div>
            <h2>Scan your menu</h2>
            <p className="muted small">Take photos of your printed menu or price list (or upload a PDF). We read the services, prices, times and packages for you to check.</p>
          </div>
          <button type="button" className="tpl-x" aria-label="Close" onClick={onClose}>×</button>
        </header>

        {st && !st.enabled ? (
          <p className="note">Menu scanning isn&apos;t switched on for your account yet. Add your services by hand for now, or ask support to switch it on.</p>
        ) : !rows ? (
          <>
            <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <div className="scan-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
              {files.length ? (
                <div className="scan-files">
                  {files.map((f, i) => (
                    <figure key={i}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {f.url ? <img src={f.url} alt={`Page ${i + 1}`} /> : <span className="scan-pdf">PDF</span>}
                      <figcaption>{f.file.name}</figcaption>
                      <button type="button" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles((xs) => xs.filter((_, n) => n !== i))}>×</button>
                    </figure>
                  ))}
                  {files.length < 6 && <button type="button" className="scan-more" onClick={() => input.current?.click()}>+ Add page</button>}
                </div>
              ) : (
                <div className="scan-empty">
                  <span aria-hidden="true" className="scan-ico">📷</span>
                  <b>Photos of your menu, one per page</b>
                  <small>Straight on, in good light, the whole page in view. Up to 6 photos, or a PDF.</small>
                  <div className="scan-btns">
                    <button type="button" className="btn primary" onClick={() => camera.current?.click()}>Take a photo</button>
                    <button type="button" className="btn" onClick={() => input.current?.click()}>Choose photos or PDF</button>
                  </div>
                </div>
              )}
            </div>
            {error && <p className="chat-err" role="alert">{error}</p>}
            <div className="scan-foot">
              <span className="small muted">{st?.left != null ? `${st.left} scan${st.left === 1 ? "" : "s"} left this month` : ""}</span>
              <button type="button" className="btn primary" disabled={!files.length || busy === "read" || st?.left === 0} onClick={read}>
                {busy === "read" ? "Reading your menu… (up to a minute)" : `Read my menu${files.length > 1 ? ` (${files.length} pages)` : ""}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="scan-sum">
              <b>Found {rows.length} item{rows.length === 1 ? "" : "s"}</b>
              <span className="muted small">
                {rows.filter((r) => r.includes.length).length ? `${rows.filter((r) => r.includes.length).length} packages · ` : ""}
                Check the names and prices, untick anything you don&apos;t want.
                {currency && currency !== business.currency && <b className="warn"> The menu shows {currency}; your prices are in {business.currency}.</b>}
              </span>
              <label className="check"><input type="checkbox" checked={all} onChange={(e) => setRows((rs) => rs!.map((r) => ({ ...r, pick: e.target.checked })))} />All</label>
            </div>
            <div className="scan-rows">
              <div className="scan-row scan-head" aria-hidden="true"><span /><span>Service or package</span><span>Price ({business.currency})</span><span>Min</span><span>Category</span></div>
              {rows.map((r, i) => (
                <div key={i} className={`scan-row${r.pick ? "" : " off"}${r.includes.length ? " pkg" : ""}`}>
                  <input type="checkbox" checked={r.pick} aria-label={`Add ${r.name}`} onChange={(e) => set(i, { pick: e.target.checked })} />
                  <div className="scan-name">
                    <input value={r.name} aria-label="Name" onChange={(e) => set(i, { name: e.target.value })} />
                    {r.includes.length > 0 && (
                      <small className="scan-incl"><b>Package</b> {r.includes.map((p) => (p.qty > 1 ? `${p.qty} × ` : "") + p.name).join(" + ")}
                        <button type="button" className="linkbtn" onClick={() => set(i, { includes: [], cat: r.cat === "Packages" ? "" : r.cat })}>Not a package</button></small>
                    )}
                    {r.existing_id && <small className="scan-have">Already on your menu at {money(r.existing_price ?? 0, business.currency)}{Number(r.existing_price) === Number(r.price) ? "" : ": adding updates the price"}</small>}
                  </div>
                  <div className="scan-price">
                    <input type="number" min="0" step="1" inputMode="decimal" value={r.price} placeholder="?" aria-label={`Price for ${r.name}`} onChange={(e) => set(i, { price: e.target.value })} />
                    <label className="check small"><input type="checkbox" checked={r.price_from} onChange={(e) => set(i, { price_from: e.target.checked })} />from</label>
                  </div>
                  <input type="number" min="5" max="720" step="5" value={r.minutes} placeholder="–" aria-label={`Minutes for ${r.name}`} onChange={(e) => set(i, { minutes: e.target.value })} />
                  <input value={r.cat} list="menu-cats" placeholder="Category" aria-label={`Category for ${r.name}`} maxLength={60} onChange={(e) => set(i, { cat: e.target.value })} />
                </div>
              ))}
            </div>
            {error && <p className="chat-err" role="alert">{error}</p>}
            <div className="scan-foot">
              <button type="button" className="btn" onClick={() => setRows(null)}>← Scan again</button>
              <span className="small muted">{noPrice ? `${noPrice} without a price: added at 0, set it after.` : ""}</span>
              <button type="button" className="btn primary" disabled={!picked.length || busy === "add"} onClick={add}>
                {busy === "add" ? "Adding…" : `Add ${picked.length} to my menu`}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
