"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

/* Tips.
 * Wrap any control in <Tip id="..." text="...">. While tips are on, each page shows its tips one
 * after another, pointing at each control ("Next" / "Got it"). A tip that's been dismissed stays
 * quiet until the app is opened again; on a computer, hovering a control shows its hint any time.
 * The Tips switch (top right) turns all of it off, and that choice is saved on the account. */

type Reg = { order: number; el: () => HTMLElement | null };
interface TipsCtx {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  seen: Set<string>;
  active: string | null;
  position: { index: number; total: number };
  register: (id: string, r: Reg) => () => void;
  dismiss: (id: string) => void;
  skipAll: () => void;
  reset: () => Promise<void>;
}

const Ctx = createContext<TipsCtx | null>(null);
const SKIP = "all-off";

const SESSION_KEY = "salon_tips_done";
function sessionDone(): string[] {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]"); } catch { return []; }
}

export function TipsProvider({ initialSeen, children }: { initialSeen: string[]; children: React.ReactNode }) {
  const [enabled, setOn] = useState(() => !initialSeen.includes(SKIP));
  // Dismissed tips are remembered for this visit only, so they come back next time the app is opened.
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  useEffect(() => setSeen(new Set(sessionDone())), []);
  const [regs, setRegs] = useState<Map<string, Reg>>(new Map());
  const [ready, setReady] = useState(false);
  const path = usePathname();
  const [doneHere, setDoneHere] = useState(0);
  useEffect(() => setDoneHere(0), [path]);

  // Give the page a moment to load before the first tip appears.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 900);
    return () => clearTimeout(t);
  }, []);

  const register = useCallback((id: string, r: Reg) => {
    setRegs((m) => new Map(m).set(id, r));
    return () => setRegs((m) => { const n = new Map(m); n.delete(id); return n; });
  }, []);

  const dismiss = useCallback((id: string) => {
    setSeen((s) => {
      const n = new Set(s).add(id);
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify([...n])); } catch { /* private mode */ }
      return n;
    });
    setDoneHere((n) => n + 1);
  }, []);
  const setEnabled = useCallback((on: boolean) => {
    setOn(on);
    api.post("/me/tips", { enabled: on }).catch(() => {});
    if (on) {
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      setSeen(new Set());
      setDoneHere(0);
    }
  }, []);
  const skipAll = useCallback(() => setEnabled(false), [setEnabled]);
  const reset = useCallback(async () => setEnabled(true), [setEnabled]);

  const queue = useMemo(() => {
    if (!ready || !enabled) return [];
    return [...regs.entries()]
      .filter(([id, r]) => {
        if (seen.has(id)) return false;
        const el = r.el();
        if (!el) return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0; // skip controls hidden on this screen size
      })
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id]) => id);
  }, [regs, seen, ready, enabled]);

  const value = useMemo<TipsCtx>(() => {
    return {
      enabled, setEnabled, seen, register, dismiss, skipAll, reset,
      active: queue[0] ?? null,
      position: { index: doneHere + 1, total: doneHere + queue.length },
    };
  }, [enabled, setEnabled, seen, register, dismiss, skipAll, reset, queue, doneHere]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTips() {
  return useContext(Ctx);
}

export function Tip({ id, text, order = 0, children }: { id: string; text: string; order?: number; children: React.ReactNode }) {
  const ctx = useContext(Ctx);
  const wrap = useRef<HTMLSpanElement>(null);
  const el = useCallback(() => (wrap.current?.firstElementChild as HTMLElement | null) ?? null, []);
  const [hover, setHover] = useState(false);

  const register = ctx?.register;
  useEffect(() => register?.(id, { order, el }), [register, id, order, el]);

  const isActive = ctx?.active === id;
  const known = !!ctx && ctx.enabled && ctx.seen.has(id);

  // Highlight the control while its tip is showing, and bring it into view.
  useEffect(() => {
    const target = el();
    if (!target || !isActive) return;
    target.classList.add("tip-on");
    const r = target.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 90) target.scrollIntoView({ block: "center", behavior: "smooth" });
    return () => target.classList.remove("tip-on");
  }, [isActive, el]);

  // After the first time, hovering the control (mouse only) shows the hint again.
  useEffect(() => {
    const target = el();
    if (!target || !known || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let t: ReturnType<typeof setTimeout>;
    const on = () => { t = setTimeout(() => setHover(true), 550); };
    const off = () => { clearTimeout(t); setHover(false); };
    target.addEventListener("mouseenter", on);
    target.addEventListener("mouseleave", off);
    target.addEventListener("mousedown", off);
    return () => { clearTimeout(t); target.removeEventListener("mouseenter", on); target.removeEventListener("mouseleave", off); target.removeEventListener("mousedown", off); };
  }, [known, el]);

  return (
    <span ref={wrap} className="tip-wrap">
      {children}
      {ctx && isActive && <Bubble target={el} text={text} ctx={ctx} id={id} />}
      {ctx && !isActive && hover && <Bubble target={el} text={text} />}
    </span>
  );
}

function Bubble({ target, text, ctx, id }: { target: () => HTMLElement | null; text: string; ctx?: TipsCtx; id?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number; arrow: number; above: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    let raf = 0;
    const place = () => {
      const t = target();
      if (!t) return;
      const r = t.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const w = Math.min(290, vw - 24);
      const h = box.current?.offsetHeight ?? 130;
      const bottomBar = vw <= 900 ? 72 : 0;
      const above = vh - bottomBar - r.bottom < h + 20 && r.top > h + 20;
      const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, vw - w - 12));
      const next = { top: Math.round(above ? r.top - h - 12 : r.bottom + 12), left: Math.round(left), arrow: Math.round(Math.max(16, Math.min(r.left + r.width / 2 - left, w - 16))), above };
      setPos((p) => (p && p.top === next.top && p.left === next.left && p.arrow === next.arrow && p.above === next.above ? p : next));
    };
    const loop = () => { place(); raf = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [target]);

  if (typeof document === "undefined") return null;
  const guided = !!ctx && !!id;
  return createPortal(
    <div
      ref={box}
      className={`tip-bubble${guided ? " guided" : ""}${pos?.above ? " above" : ""}`}
      style={{ top: pos?.top ?? -999, left: pos?.left ?? -999, ["--arrow" as string]: `${pos?.arrow ?? 20}px` }}
      role={guided ? "dialog" : "tooltip"}
      aria-live="polite"
    >
      <p>{text}</p>
      {guided && (
        <div className="tip-foot">
          <button type="button" className="tip-skip" onClick={ctx.skipAll}>Turn off tips</button>
          <span className="tip-count">{ctx.position.index} of {ctx.position.total}</span>
          <button type="button" className="tip-ok" onClick={() => ctx.dismiss(id!)}>
            {ctx.position.index < ctx.position.total ? "Next" : "Got it"}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** A Tip only when `on` is true (e.g. just the first card in a list). */
export function MaybeTip({ on, ...p }: { on: boolean; id: string; text: string; order?: number; children: React.ReactNode }) {
  return on ? <Tip {...p} /> : <>{p.children}</>;
}


/** The Tips on/off switch shown in the top-right corner of the app. */
export function TipsSwitch() {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ctx.enabled}
      className={`tips-switch${ctx.enabled ? " on" : ""}`}
      onClick={() => ctx.setEnabled(!ctx.enabled)}
      title={ctx.enabled ? "Tips are on. Tap to turn them off." : "Tips are off. Tap to turn them on."}
    >
      <span className="tips-q" aria-hidden="true">?</span>
      Tips
      <span className="tips-track" aria-hidden="true"><i /></span>
    </button>
  );
}
