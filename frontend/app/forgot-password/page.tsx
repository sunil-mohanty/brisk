"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ErrorBox } from "@/components/ui";
import { AuthShell } from "@/components/AuthShell";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  return <Suspense fallback={null}><ForgotPassword /></Suspense>;
}

function ForgotPassword() {
  const [email, setEmail] = useState(useSearchParams().get("email") ?? "");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ message: string }>("/auth/forgot-password", { email });
      setSent(r.message);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <AuthShell>
      <form className="card" onSubmit={submit}>
        <Brand className="mobile-brand" />
        <h1>Forgot your password?</h1>
        {sent ? (
          <>
            <div className="success" role="status">{sent}</div>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              The link works once and expires in 1 hour. Check your spam folder if it doesn't arrive in a few minutes.
            </p>
            <button type="button" className="btn" onClick={() => setSent(null)}>Send another link</button>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>Enter the email you sign in with and we'll send you a link to choose a new password.</p>
            <ErrorBox error={error} />
            <label>Email<input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
            <button className="btn primary" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
          </>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Remembered it? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
