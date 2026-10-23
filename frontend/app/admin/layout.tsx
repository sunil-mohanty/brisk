"use client";

import Link from "next/link";
import { site } from "@/lib/site";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui";
import { api, auth } from "@/lib/api";
import type { AuthResponse } from "@/lib/types";

const TABS = [
  ["/admin", "Overview"],
  ["/admin/smes", "SMEs"],
  ["/admin/invites", "Invite codes"],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!auth.get()) return router.replace("/login");
    api.get<AuthResponse>("/me")
      .then((r) => (r.user.is_admin ? setOk(true) : router.replace("/dashboard")))
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!ok) return <div className="empty" style={{ paddingTop: 80 }}>Loading…</div>;

  return (
    <div className="admin">
      <header className="adminbar">
        <Link href="/admin" className="brand"><i className="mark" aria-hidden="true" /><span>{site.name}</span> <span className="adminbadge">Admin</span></Link>
        <nav className="admintabs" aria-label="Admin">
          {TABS.map(([href, label]) => (
            <Link key={href} href={href} aria-current={(href === "/admin" ? path === href : path.startsWith(href)) ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
        <Link className="btn sm" href="/dashboard"><span className="long">My business app</span><span className="short">My app</span></Link>
      </header>
      <main className="adminmain">{children}</main>
      <Toaster />
    </div>
  );
}
