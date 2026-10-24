"use client";

import type { SocialProvider } from "./types";

export const PLATFORMS: { id: SocialProvider; label: string; login: "meta" | "google"; what: string; color: string }[] = [
  { id: "facebook", label: "Facebook", login: "meta", what: "Photo post on your Page, with the clickable offer link", color: "#1f5fbf" },
  { id: "instagram", label: "Instagram", login: "meta", what: "Feed post; clients scan the code in the picture", color: "#b83a7a" },
  { id: "youtube", label: "YouTube", login: "google", what: "8-second Short; the offer link goes in the description", color: "#c4302b" },
];
export const platform = (id: SocialProvider) => PLATFORMS.find((p) => p.id === id)!;
