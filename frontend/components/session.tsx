"use client";
import { words, type Words } from "@/lib/words";

import { createContext, useContext } from "react";
import type { Business, User } from "@/lib/types";

export interface Session {
  user: User;
  business: Business;
  setBusiness: (b: Business) => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside the signed-in app");
  return s;
}

/** The words for this business (salon or real estate). */
export function useWords(): Words {
  return words(useSession().business.business_type);
}
