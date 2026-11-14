/**
 * Matches the services in a template ("Ladies Haircut + Hair Treatment + Blow Dry") to the salon's own menu,
 * so the offer starts with the salon's real names and prices. Anything not on the menu is kept with no price,
 * for the owner to fill in.
 */
import type { CatalogItem } from "@/lib/types";

const STOP = new Set(["and", "or", "with", "the", "a", "an", "of", "for", "classic", "professional", "selected", "session",
  "service", "custom", "combination", "full", "min", "minute", "package"]);
// Words that say little on their own: a match needs at least one other word in common
const WEAK = new Set(["hair", "treatment", "care", "adult", "deep", "basic", "premium"]);
// A different thing if the menu item doesn't say it too: a bridal trial isn't the full bridal price
const MUST = ["trial", "child", "kid", "party", "couple", "consultation"];
const GENDER: Record<string, "w" | "m"> = { women: "w", woman: "w", ladies: "w", lady: "w", female: "w", men: "m", man: "m", gentlemen: "m", gents: "m", gent: "m", male: "m", groom: "m", barber: "m" };

function words(s: string): string[] {
  const t = s.toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[’']s\b/g, "")
    .replace(/blow[\s-]*dry(ing)?/g, "blowdry")
    .replace(/hair\s*cut/g, "haircut")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ");
  return t.split(" ").filter(Boolean).map((w) => {
    if (GENDER[w]) return w;
    if (w === "shaping") return "shape";
    if (w === "trimming") return "trim";
    if (w === "cut" || w === "cuts") return "haircut";
    if (w === "lashes" || w === "eyelashes" || w === "eyelash") return "lash";
    if (w === "brows" || w === "eyebrows" || w === "eyebrow") return "brow";
    if (w === "colour" || w === "color" || w === "coloring" || w === "colouring") return "colour";
    if (w === "nails") return "nail";
    return w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
  });
}

interface Bag { gender?: "w" | "m"; strong: Set<string>; weak: Set<string>; head?: string }
function bag(s: string): Bag {
  const b: Bag = { strong: new Set(), weak: new Set() };
  for (const w of words(s)) {
    if (GENDER[w]) { b.gender = GENDER[w]; continue; }
    if (STOP.has(w)) continue;
    if (WEAK.has(w)) b.weak.add(w);
    else { b.strong.add(w); b.head ??= w; }
  }
  return b;
}
const size = (b: Bag) => b.strong.size + b.weak.size * 0.4;
// The first real word says what the service is ("Beard Styling" is about the beard), so it counts more
const svcSize = (b: Bag) => size(b) + (b.head ? 0.5 : 0);

/** How well a menu item fits a service, 0..1, and whether it covers every word of the service. */
function fit(svc: Bag, item: Bag): { score: number; covers: boolean } {
  if (svc.gender && item.gender && svc.gender !== item.gender) return { score: 0, covers: false };
  if (MUST.some((w) => svc.strong.has(w) && !item.strong.has(w))) return { score: 0, covers: false };
  let strong = 0, weak = 0, w8 = 0;
  svc.strong.forEach((w) => { if (item.strong.has(w)) { strong++; w8 += w === svc.head ? 1.5 : 1; } });
  svc.weak.forEach((w) => { if (item.weak.has(w)) { weak++; w8 += 0.4; } });
  const covers = strong === svc.strong.size && weak === svc.weak.size && size(svc) > 0;
  // Needs a real word in common, unless the service is only weak words and the item has them all ("Hair Treatment")
  if (!strong && !(svc.strong.size === 0 && covers)) return { score: 0, covers: false };
  const score = w8 / Math.max(0.4, Math.min(svcSize(svc), size(item)));
  return { score: Math.min(1, score), covers };
}

export interface Matched {
  service: string; // as written in the template, without the "2 ×"
  quantity: number;
  item?: CatalogItem; // the menu item it became
  mergedInto?: string; // already part of another menu item, e.g. "Blow Dry" inside "Women's cut & blow-dry"
}

/** "2 × Swedish Massage" → [2, "Swedish Massage"]; "2 Adult Haircuts" → [2, "Adult Haircuts"] */
export const audienceGender = (audience: string[]): "w" | "m" | undefined =>
  audience.includes("Gentlemen") && !audience.includes("Ladies") ? "m" : audience.includes("Ladies") && !audience.includes("Gentlemen") ? "w" : undefined;

export function splitQty(s: string): [number, string] {
  const m = s.match(/^\s*(\d+)\s*[×xX*]?\s+(.+)$/);
  return m ? [Number(m[1]) || 1, m[2].trim()] : [1, s.trim()];
}

/** Compares two sort keys, first difference wins. */
function ahead(a: number[], b: number[]): boolean {
  const i = a.findIndex((v, n) => v !== b[n]);
  return i >= 0 && a[i] > b[i];
}

/** prefer: the template's audience ("w" for ladies, "m" for gentlemen), used when a service doesn't say. */
export function matchServices(services: string[], menu: CatalogItem[], prefer?: "w" | "m"): Matched[] {
  const bags = menu.map((c) => ({ c, b: bag(c.name) }));
  const used = new Map<number, CatalogItem>();
  const out: Matched[] = [];
  for (const raw of services) {
    const [quantity, service] = splitQty(raw);
    // "Eyelash Extensions or Tinting": whichever option the salon offers
    const options = service.split(/\s+or\s+/i).map((o) => { const b = bag(splitQty(o)[1]); b.gender ??= prefer; return b; });
    const all = new Set(options.flatMap((o) => [...o.strong]));
    let best: { c: CatalogItem; score: number; covers: boolean; extra: number; mine: number; lead: number } | null = null;
    for (const o of options) {
      for (const { c, b } of bags) {
        if (used.has(c.id)) continue; // one menu item, one line: never charge for the same thing twice
        const f = fit(o, b);
        if (f.score < 0.5) continue;
        const extra = Math.abs(size(b) - size(o));
        const mine = b.strong.size ? [...b.strong].filter((w) => all.has(w)).length / b.strong.size : 0; // how much of the item is this service
        const lead = b.head && b.head === o.head ? 1 : 0; // "Blow Dry" → "Blow-dry & styling" over "Women's cut & blow-dry"
        const key = [f.score, mine, lead, -extra];
        const bestKey = best ? [best.score, best.mine, best.lead, -best.extra] : null;
        if (!bestKey || ahead(key, bestKey)) best = { c, ...f, extra, mine, lead };
      }
    }
    // Already included in an item we picked ("Blow Dry" when "Women's cut & blow-dry" is in): don't charge twice
    const inside = [...used.values()].find((c) => options.some((o) => fit(o, bag(c.name)).covers));
    if (inside && quantity === 1) { out.push({ service, quantity, mergedInto: inside.name }); continue; }
    if (best) used.set(best.c.id, best.c);
    out.push({ service, quantity, item: best?.c });
  }
  return out;
}
