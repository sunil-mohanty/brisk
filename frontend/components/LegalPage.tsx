import Link from "next/link";
import { Brand } from "@/components/Brand";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="site legal">
      <header className="site-nav">
        <Brand />
        <nav className="lp-links"><Link href="/signup">Start free trial</Link></nav>
      </header>
      <article className="legal-body">
        <h1>{title}</h1>
        <p className="muted">Last updated {updated}</p>
        {children}
        <p className="muted" style={{ marginTop: 40 }}><Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link> · <Link href="/">Home</Link></p>
      </article>
    </div>
  );
}
