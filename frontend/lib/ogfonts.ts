// Fonts for link-preview images (Gloock and Hanken Grotesk, SIL Open Font License). Read once from public/fonts.
import { readFile } from "node:fs/promises";
import path from "node:path";

type F = { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" };
let cache: Promise<F[]> | null = null;

export function ogFonts() {
  const files = [
    ["Gloock", "gloock-latin-400-normal.woff", 400],
    ["Hanken", "hanken-grotesk-latin-400-normal.woff", 400],
    ["Hanken", "hanken-grotesk-latin-600-normal.woff", 600],
    ["Hanken", "hanken-grotesk-latin-700-normal.woff", 700],
  ] as const;
  cache ??= Promise.all(
    files.map(async ([name, f, weight]) => ({ name, data: await readFile(path.join(process.cwd(), "public", "fonts", f)), weight, style: "normal" as const })),
  ).catch((e) => { cache = null; throw e; });
  return cache;
}

export const OG = { cream: "#f4f2ee", paper: "#fcfbf9", clay: "#c0613f", cocoa: "#1d2330", muted: "#6d7280", sand: "#ddd7ce" };
