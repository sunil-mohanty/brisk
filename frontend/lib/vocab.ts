// Salon-specific words and starter menus. Keys match BUSINESS_TYPES in the backend.
import type { BusinessType } from "./types";

export interface MenuIdea { name: string; price: number; minutes: number; category: string }

export interface Vocab {
  label: string; // shown in the salon-type picker
  examples: string;
  staff: string; // "Stylist", "Barber", "Therapist"…
  staffPlaceholder: string;
  itemPlaceholder: string;
  requirementPlaceholder: string;
  quoteNotesPlaceholder: string;
  recordNotesPlaceholder: string;
  refPlaceholder: string;
  rebookWeeks: number; // default "next visit in" for this kind of salon
  menu: MenuIdea[]; // starter service menu
}

const H = (name: string, price: number, minutes: number, category: string): MenuIdea => ({ name, price, minutes, category });

const base: Omit<Vocab, "label" | "examples" | "menu"> = {
  staff: "Stylist",
  staffPlaceholder: "Maya",
  itemPlaceholder: "Haircut & blow-dry",
  requirementPlaceholder: "Balayage, soft caramel, long hair…",
  quoteNotesPlaceholder: "Deposit to confirm, what's included, trial session, cancellation policy…",
  recordNotesPlaceholder: "Colour formula, products used, what to try next time…",
  refPlaceholder: "e.g. Wedding on 14 Nov · home visit, Arabian Ranches",
  rebookWeeks: 6,
};

export const VOCAB: Record<BusinessType, Vocab> = {
  unisex: {
    ...base,
    label: "Unisex salon",
    examples: "Hair, colour, nails and grooming for everyone",
    menu: [H("Women's cut & blow-dry", 180, 60, "Hair"), H("Men's haircut", 70, 30, "Hair"), H("Root colour", 220, 90, "Colour"), H("Balayage", 650, 180, "Colour"), H("Gel manicure", 90, 45, "Nails"), H("Beard trim & shape", 50, 20, "Grooming"), H("Classic facial", 250, 60, "Skin")],
  },
  ladies: {
    ...base,
    label: "Ladies salon",
    examples: "Hair, colour, nails, threading, bridal",
    menu: [H("Cut & blow-dry", 180, 60, "Hair"), H("Blow-dry & styling", 90, 45, "Hair"), H("Full head colour", 350, 120, "Colour"), H("Keratin treatment", 700, 150, "Colour"), H("Threading – eyebrows", 30, 15, "Brows & lashes"), H("Gel manicure", 90, 45, "Nails"), H("Bridal hair & makeup", 1800, 180, "Bridal")],
  },
  gents: {
    ...base,
    label: "Barbershop / gents salon",
    examples: "Cuts, fades, beard, grooming",
    staff: "Barber",
    staffPlaceholder: "Karim",
    itemPlaceholder: "Skin fade",
    requirementPlaceholder: "Skin fade + beard line-up, Saturday afternoon…",
    recordNotesPlaceholder: "Clipper guard, beard shape, products…",
    rebookWeeks: 3,
    menu: [H("Haircut", 70, 30, "Hair"), H("Skin fade", 80, 40, "Hair"), H("Beard trim & shape", 50, 20, "Beard"), H("Hot towel shave", 60, 30, "Beard"), H("Kids' haircut", 50, 25, "Hair"), H("Facial & mask", 120, 40, "Grooming")],
  },
  spa: {
    ...base,
    label: "Spa & wellness",
    examples: "Massage, facials, body treatments, Moroccan bath",
    staff: "Therapist",
    staffPlaceholder: "Joy",
    itemPlaceholder: "Swedish massage 60 min",
    requirementPlaceholder: "Couples massage for an anniversary, Friday evening…",
    recordNotesPlaceholder: "Pressure, oils used, areas to avoid…",
    rebookWeeks: 4,
    menu: [H("Swedish massage 60 min", 300, 60, "Massage"), H("Deep tissue massage 60 min", 350, 60, "Massage"), H("Moroccan bath", 250, 60, "Body"), H("Hydrating facial", 280, 60, "Skin"), H("Foot reflexology", 180, 45, "Massage")],
  },
  nails: {
    ...base,
    label: "Nail & lash studio",
    examples: "Manicure, pedicure, extensions, lashes, brows",
    staff: "Nail artist",
    staffPlaceholder: "Joy",
    itemPlaceholder: "Gel manicure",
    requirementPlaceholder: "Gel extensions with French tips…",
    recordNotesPlaceholder: "Shape, length, colour codes, lash curl and length…",
    rebookWeeks: 3,
    menu: [H("Classic manicure", 60, 30, "Nails"), H("Gel manicure", 90, 45, "Nails"), H("Gel pedicure", 120, 60, "Nails"), H("Gel extensions", 220, 90, "Nails"), H("Lash extensions – classic", 250, 90, "Lashes"), H("Lash lift & tint", 180, 60, "Lashes"), H("Brow lamination", 150, 45, "Brows")],
  },
  home: {
    ...base,
    label: "Home beauty service",
    examples: "Mobile hair, makeup, nails and massage at the client's home",
    staff: "Beautician",
    staffPlaceholder: "Name",
    refPlaceholder: "e.g. Villa 12, Arabian Ranches · gate code 4521",
    menu: [H("Home visit charge", 50, 0, "Visit"), H("Blow-dry at home", 150, 45, "Hair"), H("Party makeup", 350, 60, "Makeup"), H("Mani-pedi at home", 200, 90, "Nails"), H("Bridal hair & makeup", 2000, 180, "Bridal")],
  },
};

export const BUSINESS_TYPES: BusinessType[] = ["unisex", "ladies", "gents", "spa", "nails", "home"];

export function vocab(type: string | null | undefined): Vocab {
  return VOCAB[(type as BusinessType) in VOCAB ? (type as BusinessType) : "unisex"];
}

/** Common menu headings, offered when adding a service. */
export const CATEGORIES = ["Hair", "Colour", "Nails", "Skin", "Brows & lashes", "Grooming", "Beard", "Massage", "Body", "Makeup", "Bridal"];

export const TIME_SLOTS = ["Morning", "Afternoon", "Evening", "Any time"];

export const duration = (min: number | null | undefined) =>
  !min ? "" : min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min / 60} h`;
