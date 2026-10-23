"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ErrorBox } from "@/components/ui";
import { AuthShell } from "@/components/AuthShell";
import { Brand } from "@/components/Brand";
import { api, auth } from "@/lib/api";
import type { AuthResponse } from "@/lib/types";

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetPassword /></Suspense>;
}

function ResetPassword() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<AuthResponse>("/auth/reset-password", { token, password });
      auth.set(res.token);
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
        <h1>Choose a new password</h1>
        {!token ? (
          <>
            <div className="error" role="alert">This page needs the link from your reset email.</div>
            <Link className="btn primary" href="/forgot-password">Request a reset link</Link>
          </>
        ) : (
          <>
            <ErrorBox error={error} />
            {error?.includes("Request a new one") && <Link href="/forgot-password">Request a new reset link</Link>}
            <label>
              New password
              <input id="new-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <label>
              Type it again
              <input id="confirm-password" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </label>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>At least 8 characters. You'll be signed out on other devices.</p>
            <button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save and sign in"}</button>
          </>
        )}
      </form>
    </AuthShell>
  );
}
