"use client";

import Link from "next/link";
import { site } from "@/lib/site";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorBox, PageHead, Pill, toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { ImportPreview, ImportPreviewRow, ImportRow, ImportStatus } from "@/lib/types";

type Source = "phone" | "file" | "paste";

const STATUS: Record<ImportStatus, { pill: string; label: string }> = {
  new: { pill: "won", label: "New" },
  existing: { pill: "neutral", label: "Already a client" },
  duplicate: { pill: "soon", label: "Repeated in list" },
  no_phone: { pill: "lost", label: "No mobile number" },
};

// The Contact Picker API exists in Chrome on Android only.
interface PickedContact { name?: string[]; tel?: string[]; email?: string[] }
type ContactsManager = { select: (props: string[], opts: { multiple: boolean }) => Promise<PickedContact[]> };

export default function ImportCustomersPage() {
  const [source, setSource] = useState<Source>("file");
  const [picker, setPicker] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ok = typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;
    setPicker(ok);
    if (ok) setSource("phone");
  }, []);

  function showPreview(p: ImportPreview) {
    setPreview(p);
    setPicked(new Set(p.rows.flatMap((r, i) => (r.status === "new" ? [i] : []))));
    setDone(null);
  }

  async function run(fn: () => Promise<ImportPreview>) {
    setBusy(true);
    setError(null);
    try {
      showPreview(await fn());
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function pickFromPhone() {
    try {
      const contacts = (navigator as unknown as { contacts: ContactsManager }).contacts;
      const res = await contacts.select(["name", "tel", "email"], { multiple: true });
      if (!res.length) return;
      const rows: ImportRow[] = res.map((c) => ({ name: c.name?.[0] ?? "", phone: c.tel?.[0] ?? null, email: c.email?.[0] ?? null, area: null }));
      run(() => api.post<ImportPreview>("/customers/import/preview", { rows }));
    } catch {
      setError("Your phone didn't share the contacts. Allow access when asked, or upload a contacts file instead.");
    }
  }

  function onFile(f: File | undefined | null) {
    if (f) run(() => api.upload<ImportPreview>("/customers/import/preview-file", f));
  }

  async function save() {
    if (!preview) return;
    const rows = preview.rows.filter((_, i) => picked.has(i)).map(({ name, phone, email, area }) => ({ name, phone, email, area }));
    if (!rows.length) return setError("Tick at least one contact to import.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ created: number; skipped: number }>("/customers/import", { rows });
      setDone(r);
      setPreview(null);
      setText("");
      toast(`${r.created} customer${r.created === 1 ? "" : "s"} imported`);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <>
      <PageHead
        eyebrow="Client list"
        title="Import clients"
        sub="Bring in the clients you already have, from your phone, a spreadsheet or a pasted list. You'll check the list before anything is saved."
        action={<Link className="btn" href="/customers">Back to customers</Link>}
      />

      {done && (
        <div className="success" style={{ marginBottom: 16 }} role="status">
          Imported <b>{done.created}</b> customer{done.created === 1 ? "" : "s"}
          {done.skipped ? ` · skipped ${done.skipped} already saved` : ""}. <Link href="/customers">View clients</Link>
        </div>
      )}

      {!preview && (
        <>
          <div className="srcs" role="tablist">
            {(["phone", "file", "paste"] as Source[]).map((s) => (
              <button key={s} role="tab" aria-selected={source === s} className="src" onClick={() => setSource(s)}>
                <b>{s === "phone" ? "From my phone" : s === "file" ? "Upload a file" : "Paste a list"}</b>
                <span>{s === "phone" ? "Pick contacts from your address book" : s === "file" ? "Contacts file, Excel or CSV" : "Copy from Notes, WhatsApp or email"}</span>
              </button>
            ))}
          </div>

          <ErrorBox error={error} />

          <section className="card importbox">
            {source === "phone" && (picker ? (
              <div className="center">
                <p>Your phone will open its contact list. Tick your clients, then tap <b>Done</b>.</p>
                <button className="btn primary big" onClick={pickFromPhone} disabled={busy}>{busy ? "Reading contacts…" : "Choose contacts"}</button>
                <p className="muted small">Only the contacts you tick are shared with {site.name}.</p>
              </div>
            ) : (
              <div className="howto">
                <p>This browser can't open your contacts directly (only Chrome on Android can). Export them as a contacts file and upload it. It takes a minute:</p>
                <div className="howgrid">
                  <div>
                    <h3>iPhone</h3>
                    <ol>
                      <li>Open the <b>Contacts</b> app and tap <b>Lists</b> (top left).</li>
                      <li>Touch and hold <b>All Contacts</b> (or a list of your clients), then tap <b>Export</b>.</li>
                      <li>Save to Files, or AirDrop / email it to the computer you use for {site.name}.</li>
                    </ol>
                  </div>
                  <div>
                    <h3>Android</h3>
                    <ol>
                      <li>Open <b>Contacts</b> → <b>Fix &amp; manage</b> (or ⋮ → Settings).</li>
                      <li>Tap <b>Export to file</b>. It saves a <span className="mono">.vcf</span> file.</li>
                      <li>Or open this page in <b>Chrome</b> on the phone and use <b>Choose contacts</b>.</li>
                    </ol>
                  </div>
                  <div>
                    <h3>Google Contacts</h3>
                    <ol>
                      <li>Go to contacts.google.com.</li>
                      <li>Click <b>Export</b>, choose <b>vCard</b> or <b>Google CSV</b>.</li>
                    </ol>
                  </div>
                </div>
                <button className="btn primary" onClick={() => setSource("file")}>I have the file, upload it</button>
              </div>
            ))}

            {source === "file" && (
              <div
                className={`drop${dragging ? " over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}
              >
                <p><b>Drop a file here</b> or</p>
                <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "Reading file…" : "Choose file"}</button>
                <input ref={fileRef} id="import-file" type="file" hidden accept=".vcf,.vcard,.csv,.xlsx,.txt,text/vcard,text/csv" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
                <p className="muted small">
                  Phone contacts (<span className="mono">.vcf</span>), Excel (<span className="mono">.xlsx</span>) or <span className="mono">.csv</span>, up to 5 MB.
                  For a spreadsheet, a column for the name and one for the mobile number is enough.
                </p>
              </div>
            )}

            {source === "paste" && (
              <div className="stackform">
                <label>
                  One customer per line, name and mobile number
                  <textarea id="paste" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Ahmed Al Mansoori 050 441 2290\nPriya Nair, +971 55 918 3301\nOmar - 052 600 7714"} />
                </label>
                <div><button className="btn primary" disabled={busy || !text.trim()} onClick={() => run(() => api.post<ImportPreview>("/customers/import/preview", { text }))}>{busy ? "Checking…" : "Check list"}</button></div>
              </div>
            )}
          </section>
        </>
      )}

      {preview && (
        <Review
          preview={preview}
          picked={picked}
          setPicked={setPicked}
          busy={busy}
          error={error}
          onCancel={() => { setPreview(null); setError(null); }}
          onSave={save}
        />
      )}
    </>
  );
}

function Review(props: {
  preview: ImportPreview;
  picked: Set<number>;
  setPicked: (s: Set<number>) => void;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { preview, picked, setPicked, busy, error, onCancel, onSave } = props;
  const [filter, setFilter] = useState<ImportStatus | "all">("all");
  const rows = useMemo(() => preview.rows.map((r, i) => ({ r, i })).filter(({ r }) => filter === "all" || r.status === filter), [preview, filter]);
  const selectable = (r: ImportPreviewRow) => r.status === "new" || r.status === "no_phone";
  const visibleSelectable = rows.filter(({ r }) => selectable(r));
  const allOn = visibleSelectable.length > 0 && visibleSelectable.every(({ i }) => picked.has(i));

  const toggle = (i: number) => {
    const n = new Set(picked);
    if (n.has(i)) n.delete(i); else n.add(i);
    setPicked(n);
  };
  const toggleAll = () => {
    const n = new Set(picked);
    visibleSelectable.forEach(({ i }) => (allOn ? n.delete(i) : n.add(i)));
    setPicked(n);
  };

  return (
    <section>
      <div className="reviewhead">
        <div>
          <h2>Check before importing</h2>
          <p className="muted">
            Found {preview.rows.length} contact{preview.rows.length === 1 ? "" : "s"}. New ones are ticked.
            Clients already saved (same mobile number) won't be added twice.
          </p>
        </div>
        <div className="acts">
          <button className="btn" onClick={onCancel}>Start over</button>
          <button className="btn primary" disabled={busy || !picked.size} onClick={onSave}>
            {busy ? "Importing…" : `Import ${picked.size} customer${picked.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="filters" style={{ marginTop: 12 }}>
        <button className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All <span className="mono">{preview.rows.length}</span></button>
        {(Object.keys(STATUS) as ImportStatus[]).filter((k) => preview.counts[k]).map((k) => (
          <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {STATUS[k].label} <span className="mono">{preview.counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="tablewrap">
        <table className="imptable">
          <thead>
            <tr>
              <th style={{ width: 36 }}><input type="checkbox" aria-label="Select all" checked={allOn} onChange={toggleAll} disabled={!visibleSelectable.length} /></th>
              <th>Name</th><th>Mobile</th><th className="opt">Email</th><th className="opt">Area</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, i }) => (
              <tr key={i} className={selectable(r) ? "" : "dim"} onClick={() => selectable(r) && toggle(i)} style={{ cursor: selectable(r) ? "pointer" : "default" }}>
                <td><input type="checkbox" aria-label={`Import ${r.name}`} checked={picked.has(i)} disabled={!selectable(r)} onChange={() => toggle(i)} onClick={(e) => e.stopPropagation()} /></td>
                <td><b>{r.name}</b></td>
                <td className="mono">{r.phone ?? "—"}</td>
                <td className="sub opt">{r.email ?? ""}</td>
                <td className="sub opt">{r.area ?? ""}</td>
                <td>
                  <Pill status={STATUS[r.status].pill} label={STATUS[r.status].label} />
                  {r.existing_name && r.existing_name !== r.name && <div className="sub">as “{r.existing_name}”</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
