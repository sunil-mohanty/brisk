"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Tip, TipsProvider, TipsSwitch } from "@/components/Tips";
import { SessionContext, type Session } from "@/components/session";
import { Brand } from "@/components/Brand";
import { Toaster } from "@/components/ui";
import { api, auth } from "@/lib/api";
import type { AuthResponse } from "@/lib/types";
import { helpLink, site } from "@/lib/site";

type IconName = keyof typeof Icon;

const NAV: [string, string][] = [
  ["/dashboard", "Today"],
  ["/appointments", "Appointments"],
  ["/leads", "Enquiries"],
  ["/quotes", "Quotes"],
  ["/link", "Link page"],
  ["/customers", "Clients"],
  ["/services", "Visits"],
];
const TABS: [string, string, IconName][] = [
  ["/dashboard", "Today", "home"],
  ["/appointments", "Diary", "calendar"],
  ["/leads", "Enquiries", "leads"],
  ["/link", "Link page", "link"],
];
const MORE: [string, string, IconName][] = [
  ["/quotes", "Quotes", "quotes"],
  ["/customers", "Clients", "customers"],
  ["/services", "Visits & rebooking", "services"],
  ["/qr", "QR codes", "qr"],
  ["/team", "Team", "team"],
  ["/settings", "Salon profile & menu", "settings"],
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [session, setSession] = useState<Omit<Session, "setBusiness"> | null>(null);
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMore(false); setMenu(false); }, [path]);
  useEffect(() => {
    if (!more && !menu) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (setMore(false), setMenu(false));
    const out = (e: MouseEvent) => menu && !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("keydown", esc);
    window.addEventListener("mousedown", out);
    return () => { window.removeEventListener("keydown", esc); window.removeEventListener("mousedown", out); };
  }, [more, menu]);

  useEffect(() => {
    if (!auth.get()) {
      router.replace("/login");
      return;
    }
    api
      .get<AuthResponse>("/me")
      .then(({ user, business }) => {
        setSession({ user, business });
        // Load the main lists quietly so the first visit to each page is instant.
        setTimeout(() => ["/leads", "/quotes", "/services", "/customers", "/team", "/linkpage"].forEach(api.prefetch), 300);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!session) return <div className="empty" style={{ paddingTop: 80 }}>Loading…</div>;

  const signOut = () => {
    auth.clear();
    router.replace("/login");
  };
  const here = (href: string) => path.startsWith(href);
  const help = helpLink();
  const moreActive = MORE.some(([href]) => here(href));
  const initial = (session.business.name.trim()[0] || "S").toUpperCase();

  return (
    <SessionContext.Provider value={{ ...session, setBusiness: (business) => setSession({ ...session, business }) }}>
      <TipsProvider initialSeen={session.user.seen_tips ?? []}>
      <div className="app">
        <header className="topbar">
          <div className="topbar-in">
            <Brand href="/dashboard" />
            <nav className="nav" aria-label="Main">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} aria-current={here(href) ? "page" : undefined}>{label}</Link>
              ))}
            </nav>
            <div className="who" ref={menuRef}>
              <button type="button" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu(!menu)}>
                <span className="who-name">{session.business.name}</span>
                <span className="who-av" aria-hidden="true">{initial}</span>
              </button>
              {menu && (
                <div className="who-menu" role="menu">
                  <div className="who-head"><b>{session.business.name}</b><span>{session.user.name} · {session.user.email}</span></div>
                  <Link role="menuitem" href="/settings">{Icon.settings()}Salon profile & menu</Link>
                  <Link role="menuitem" href="/team">{Icon.team()}Team</Link>
                  <Link role="menuitem" href="/qr">{Icon.qr()}QR codes</Link>
                  {session.user.is_admin && <Link role="menuitem" href="/admin">{Icon.admin()}{site.name} admin</Link>}
                  {help && <a role="menuitem" href={help} target="_blank" rel="noreferrer">{Icon.help()}Help on WhatsApp</a>}
                  <button role="menuitem" type="button" className="out" onClick={signOut}>{Icon.signout()}Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="page">
          <div className="page-top"><TipsSwitch /></div>
          {children}
        </main>
      </div>

      {/* Phones: thumb-reach tab bar */}
      <nav className="tabbar" aria-label="Main">
        {TABS.map(([href, label, icon]) => (
          <Link key={href} href={href} aria-current={here(href) ? "page" : undefined}>{Icon[icon]()}<span>{label}</span></Link>
        ))}
        <Tip id="nav.more" order={90} text="Quotes, clients, visits, QR codes, your team and salon profile are in here.">
          <button type="button" aria-expanded={more} aria-current={moreActive ? "page" : undefined} onClick={() => setMore(true)}>{Icon.more()}<span>More</span></button>
        </Tip>
      </nav>
      {more && (
        <div className="moresheet" role="dialog" aria-modal="true" aria-label="More" onClick={() => setMore(false)}>
          <div className="moresheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="moresheet-who"><b>{session.business.name}</b><span>{session.user.name} · {session.user.email}</span></div>
            {MORE.map(([href, label, icon]) => (
              <Link key={href} href={href} aria-current={here(href) ? "page" : undefined} onClick={() => setMore(false)}>{Icon[icon]()}{label}</Link>
            ))}
            {session.user.is_admin && <Link href="/admin" className="adm" onClick={() => setMore(false)}>{Icon.admin()}{site.name} admin</Link>}
            {help && <a href={help} target="_blank" rel="noreferrer">{Icon.help()}Help on WhatsApp</a>}
            <button type="button" onClick={signOut}>{Icon.signout()}Sign out</button>
          </div>
        </div>
      )}
      <Toaster />
      </TipsProvider>
    </SessionContext.Provider>
  );
}
