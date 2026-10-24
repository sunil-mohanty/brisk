"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Tip, TipsProvider, TipsSwitch } from "@/components/Tips";
import { SessionContext, type Session } from "@/components/session";
import { Toaster } from "@/components/ui";
import { api, auth } from "@/lib/api";
import type { AuthResponse } from "@/lib/types";
import { helpLink, site } from "@/lib/site";
import { words, type Words } from "@/lib/words";
import { BriskMark } from "@/components/Logo";

type IconName = keyof typeof Icon;
type NavItem = [href: string, label: string, icon: IconName];

function groups(linkPage: boolean, w: Words): [string, NavItem[]][] {
  return [
    ["Overview", [
      ["/dashboard", "Today", "today"],
      ["/appointments", w.Appointments, "appointments"],
      ["/leads", "Enquiries", "enquiries"],
      ["/quotes", "Quotes", "quotes"],
      ...(linkPage ? ([["/link", "Link page", "link"]] as NavItem[]) : []),
    ]],
    ["People", [
      ["/customers", "Clients", "customers"],
      ["/team", w.Staff, "staff"],
    ]],
    ["Operations", [
      ["/services", w.Visits, "visits"],
      ["/menu", w.Services, "menu"],
      ...(w.inventory ? ([["/inventory", "Inventory", "inventory"]] as NavItem[]) : []),
    ]],
  ];
}

const tabs = (w: Words): NavItem[] => [
  ["/dashboard", "Today", "today"],
  ["/appointments", w.diary, "appointments"],
  ["/leads", "Enquiries", "enquiries"],
  ["/quotes", "Quotes", "quotes"],
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [session, setSession] = useState<Omit<Session, "setBusiness"> | null>(null);
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMore(false); setMenu(false); }, [path]);
  useEffect(() => () => { delete document.documentElement.dataset.vertical; }, []);
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
        document.documentElement.dataset.vertical = words(business.business_type).vertical;
        setTimeout(() => ["/leads", "/quotes", "/services", "/customers", "/team", "/catalog", "/inventory"].forEach(api.prefetch), 300);
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
  const b = session.business;
  const w = words(b.business_type);
  const vertical = w.vertical;
  const TABS = tabs(w);
  const nav = groups(b.link_page_enabled, w);
  const moreItems = nav.flatMap(([, items]) => items).filter(([href]) => !TABS.some(([t]) => t === href));
  const moreActive = moreItems.some(([href]) => here(href)) || here("/settings") || here("/qr");
  const initial = (b.name.trim()[0] || "S").toUpperCase();
  const area = b.address ? b.address.split(",").slice(-2).join(",").trim() : "Dubai, UAE";

  return (
    <SessionContext.Provider value={{ ...session, setBusiness: (business) => setSession({ ...session, business }) }}>
      <TipsProvider initialSeen={session.user.seen_tips ?? []}>
      <div className="app" data-vertical={vertical}>
        <aside className="side" aria-label="Main">
          <Link href="/dashboard" className="side-brand" aria-label={`${site.name} home`}>
            <BriskMark size={42} tile="var(--accent)" spark={vertical === "salon" ? "rgba(255,255,255,.65)" : "var(--spark, #d4704a)"} />
            <span>{site.name}</span>
          </Link>
          <nav className="side-nav">
            {nav.map(([label, items]) => (
              <div className="side-group" key={label}>
                <span className="side-label">{label}</span>
                {items.map(([href, text, icon]) => (
                  <Link key={href} href={href} aria-current={here(href) ? "page" : undefined}>{Icon[icon]()}<span>{text}</span></Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="side-foot" ref={menuRef}>
            {menu && (
              <div className="side-menu" role="menu">
                <Link role="menuitem" href="/settings">{Icon.settings()}{w.profile}</Link>
                <Link role="menuitem" href="/qr">{Icon.qr()}QR codes</Link>
                {session.user.is_admin && <Link role="menuitem" href="/admin">{Icon.admin()}{site.name} admin</Link>}
                {help && <a role="menuitem" href={help} target="_blank" rel="noreferrer">{Icon.help()}Help on WhatsApp</a>}
                <div className="side-tips"><TipsSwitch /></div>
                <button role="menuitem" type="button" className="out" onClick={signOut}>{Icon.signout()}Sign out</button>
              </div>
            )}
            <button type="button" className="side-salon" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu(!menu)}>
              <span className="side-av" aria-hidden="true">{initial}</span>
              <span className="side-salon-t"><b>{b.name}</b><span>{area}</span></span>
            </button>
          </div>
        </aside>
        <main className="page">{children}</main>
      </div>

      {/* Phones: thumb-reach tab bar */}
      <nav className="tabbar" aria-label="Main">
        {TABS.map(([href, label, icon]) => (
          <Link key={href} href={href} aria-current={here(href) ? "page" : undefined}>{Icon[icon]()}<span>{label}</span></Link>
        ))}
        <Tip id="nav.more" order={90} text={`Clients, ${w.staff}, ${w.visits}, ${w.services}${w.inventory ? ", inventory" : ""} and your ${w.business} profile are in here.`}>
          <button type="button" aria-expanded={more} aria-current={moreActive ? "page" : undefined} onClick={() => setMore(true)}>{Icon.more()}<span>More</span></button>
        </Tip>
      </nav>
      {more && (
        <div className="moresheet" role="dialog" aria-modal="true" aria-label="More" onClick={() => setMore(false)}>
          <div className="moresheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="moresheet-who"><b>{b.name}</b><span>{session.user.name} · {session.user.email}</span></div>
            {moreItems.map(([href, label, icon]) => (
              <Link key={href} href={href} aria-current={here(href) ? "page" : undefined} onClick={() => setMore(false)}>{Icon[icon]()}{label}</Link>
            ))}
            <Link href="/settings" aria-current={here("/settings") ? "page" : undefined} onClick={() => setMore(false)}>{Icon.settings()}{w.profile}</Link>
            <Link href="/qr" aria-current={here("/qr") ? "page" : undefined} onClick={() => setMore(false)}>{Icon.qr()}QR codes</Link>
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
