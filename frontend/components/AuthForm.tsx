"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Brand } from "@/components/Brand";
import { ErrorBox } from "@/components/ui";
import { api, auth } from "@/lib/api";
import { site } from "@/lib/site";
import { cameFrom, rememberSource, trackSignup } from "@/lib/track";
import type { AuthResponse, BusinessType } from "@/lib/types";
import { BUSINESS_TYPES, VOCAB } from "@/lib/vocab";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const codeFromLink = params.get("code") ?? "";
  const typeFromLink = params.get("type") as BusinessType | null;
  const [f, setF] = useState({
    business_name: "", name: "", email: params.get("email") ?? "", password: "", phone: "", invite_code: codeFromLink,
    business_type: typeFromLink && BUSINESS_TYPES.includes(typeFromLink) ? typeFromLink : ("" as BusinessType | ""),
  });
  const [showCode, setShowCode] = useState(!!codeFromLink);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { rememberSource(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = mode === "login"
        ? { email: f.email, password: f.password }
        : { ...f, phone: f.phone || null, invite_code: f.invite_code.trim() || null, business_type: f.business_type || "unisex", ...cameFrom() };
      const res = await api.post<AuthResponse>(mode === "login" ? "/auth/login" : "/auth/signup", body);
      auth.set(res.token);
      if (mode === "signup") trackSignup();
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form className="card" onSubmit={submit}>
        <Brand className="mobile-brand" />
        <div>
          <h1>{mode === "login" ? "Welcome back" : `Start your free ${site.trialDays}-day trial`}</h1>
          {mode === "signup" && <p className="muted" style={{ margin: "4px 0 0" }}>No card needed. Set up in a few minutes.</p>}
        </div>
        <ErrorBox error={error} />
        {mode === "signup" && (
          <>
            <label>Salon name<input id="business_name" required value={f.business_name} onChange={set("business_name")} placeholder="e.g. Layla Beauty Lounge" autoComplete="organization" /></label>
            <label>
              What kind of salon?
              <select id="business_type" required value={f.business_type} onChange={set("business_type")}>
                <option value="" disabled>Choose one…</option>
                {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{VOCAB[t].label}</option>)}
              </select>
              {f.business_type && <span className="hint">{VOCAB[f.business_type].examples}</span>}
            </label>
            <label>Your name<input id="name" required value={f.name} onChange={set("name")} autoComplete="name" /></label>
            <label>Salon WhatsApp number<input id="phone" value={f.phone} onChange={set("phone")} placeholder="050 123 4567" inputMode="tel" autoComplete="tel" /></label>
          </>
        )}
        <label>Email<input id="email" type="email" required value={f.email} onChange={set("email")} autoComplete="email" /></label>
        <label>
          <span className="labelrow">
            Password
            {mode === "login" && <Link href={`/forgot-password${f.email ? `?email=${encodeURIComponent(f.email)}` : ""}`}>Forgot password?</Link>}
          </span>
          <input id="password" type="password" required minLength={mode === "signup" ? 8 : 1} value={f.password} onChange={set("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "signup" ? "At least 8 characters" : undefined} />
        </label>
        {mode === "signup" && (showCode
          ? <label>Invite code (optional)<input id="invite_code" value={f.invite_code} onChange={set("invite_code")} placeholder="XXXX-XXXX" autoComplete="off" /></label>
          : <button type="button" className="linkbtn" onClick={() => setShowCode(true)}>Have an invite code?</button>)}
        <button className="btn primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create my account"}</button>
        {mode === "signup" && (
          <p className="muted small" style={{ margin: 0 }}>
            By creating an account you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
          </p>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {mode === "login" ? <>New to {site.name}? <Link href="/signup">Start a free trial</Link></> : <>Already have an account? <Link href="/login">Sign in</Link></>}
        </p>
      </form>
    </AuthShell>
  );
}
