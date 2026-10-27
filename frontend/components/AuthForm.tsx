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
import { BUSINESS_TYPES } from "@/lib/vocab";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const codeFromLink = params.get("code") ?? "";
  const typeFromLink = params.get("type");
  // ?type=salon, ?type=real_estate, or a kind of salon (?type=gents) from older links and ads
  const kindFromLink: "" | "salon" | "real_estate" = typeFromLink === "real_estate" ? "real_estate"
    : typeFromLink === "salon" || BUSINESS_TYPES.includes(typeFromLink as BusinessType) ? "salon" : "";
  const [f, setF] = useState({
    business_name: "", name: "", email: params.get("email") ?? "", password: "", phone: "", invite_code: codeFromLink,
    kind: kindFromLink,
  });
  const [showCode, setShowCode] = useState(!!codeFromLink);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const re = f.kind === "real_estate";

  useEffect(() => { rememberSource(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = mode === "login"
        ? { email: f.email, password: f.password }
        : {
            business_name: f.business_name, name: f.name, email: f.email, password: f.password, phone: f.phone || null,
            invite_code: f.invite_code.trim() || null, ...cameFrom(),
            business_type: re ? "real_estate" : BUSINESS_TYPES.includes(typeFromLink as BusinessType) ? typeFromLink : "unisex",
          };
      if (mode === "signup" && !f.kind) throw new Error("Select your business: Salon or Real estate.");
      const res = await api.post<AuthResponse>(mode === "login" ? "/auth/login" : "/auth/signup", body);
      auth.set(res.token);
      if (mode === "signup") trackSignup();
      router.replace(res.user.role === "staff" ? "/me" : "/dashboard");
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
            <fieldset className="bizpick">
              <legend>Select your business</legend>
              <div className="bizpick-row" role="radiogroup">
                <label>
                  <input type="radio" name="kind" value="salon" required checked={f.kind === "salon"} onChange={() => setF({ ...f, kind: "salon" })} />
                  <span><b>Salon</b><small>Hair, beauty, barber, spa, nails</small></span>
                </label>
                <label>
                  <input type="radio" name="kind" value="real_estate" checked={f.kind === "real_estate"} onChange={() => setF({ ...f, kind: "real_estate" })} />
                  <span><b>Real estate</b><small>Brokers, agencies, leasing</small></span>
                </label>
              </div>
            </fieldset>
            <label>{re ? "Agency or business name" : "Business name"}<input id="business_name" required value={f.business_name} onChange={set("business_name")} placeholder={re ? "e.g. Marina Key Properties" : "e.g. Layla Beauty Lounge"} autoComplete="organization" /></label>
            <label>Your name<input id="name" required value={f.name} onChange={set("name")} autoComplete="name" /></label>
            <label>Business WhatsApp number<input id="phone" value={f.phone} onChange={set("phone")} placeholder="050 123 4567" inputMode="tel" autoComplete="tel" /></label>
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
