"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { auth } from "@/lib/api";
import { rememberSource } from "@/lib/track";

/** Sign in / Open app, depending on whether this browser is signed in. */
export function HomeNav() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(!!auth.get()), []);
  return signedIn ? (
    <nav className="lp-links"><Link className="btn primary" href="/dashboard">Open my dashboard</Link></nav>
  ) : (
    <nav className="lp-links">
      <Link href="/login">Sign in</Link>
      <Link className="btn primary" href="/signup">Start free trial</Link>
    </nav>
  );
}

/** Remembers which ad or site sent this visitor, for the sign-up that may follow. */
export function SourceMemo() {
  useEffect(() => rememberSource(), []);
  return null;
}
