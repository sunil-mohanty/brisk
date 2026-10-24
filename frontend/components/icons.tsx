// Small stroke icons for the phone tab bar. 24px grid, currentColor.
const P = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const Icon = {
  home: () => <svg {...P}><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></svg>,
  leads: () => <svg {...P}><path d="M4 5h16l-6 7v6l-4 2v-8z" /></svg>,
  quotes: () => <svg {...P}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg>,
  calendar: () => <svg {...P}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M8 14h3" /></svg>,
  link: () => <svg {...P}><path d="M7 21V10a5 5 0 0 1 10 0v11" /><path d="M4 21h16" /><path d="M10 11l2.5-2.5M10 15l4.5-4.5" /></svg>,
  team: () => <svg {...P}><path d="M8 20v-8a4 4 0 0 1 8 0v8" /><path d="M5 20h14" /><circle cx="12" cy="5" r="1.6" /></svg>,
  services: () => <svg {...P}><path d="M6 4l12 16M18 4L6 20" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="18" r="2.2" /></svg>,
  today: () => <svg {...P}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  appointments: () => <svg {...P}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><rect x="12" y="13" width="4" height="3.5" rx=".6" fill="currentColor" stroke="none" /></svg>,
  enquiries: () => <svg {...P}><path d="M4 5.5h16v10H9l-5 4z" /></svg>,
  staff: () => <svg {...P}><circle cx="12" cy="8" r="3.4" /><path d="M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5" /></svg>,
  visits: () => <svg {...P}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17A8.5 8.5 0 0 1 12 3.5z" fill="currentColor" /></svg>,
  menu: () => <svg {...P}><circle cx="6.5" cy="7" r="2.5" /><circle cx="6.5" cy="17" r="2.5" /><path d="M8.6 8.4L20 16M8.6 15.6L20 8" /></svg>,
  inventory: () => <svg {...P}><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>,
  campaign: () => <svg {...P}><path d="M4 10v4h3l6 4V6L7 10z" /><path d="M17 9a4 4 0 0 1 0 6" /></svg>,
  more: () => <svg {...P}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>,
  customers: () => <svg {...P}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.3c1.5.7 2.6 2.3 3 4.7" /></svg>,
  qr: () => <svg {...P}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2" /></svg>,
  settings: () => <svg {...P}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></svg>,
  admin: () => <svg {...P}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  help: () => <svg {...P}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.4M12 17h.01" /></svg>,
  signout: () => <svg {...P}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>,
};

/* Social icons for the link page (simple outlines, not brand logos). */
const S = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
export const Social = {
  instagram: () => <svg {...S}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".6" fill="currentColor" /></svg>,
  tiktok: () => <svg {...S}><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 3c.4 2.6 2.2 4.4 5 4.6" /></svg>,
  snapchat: () => <svg {...S}><path d="M12 3.5c3 0 4.6 2.2 4.6 4.8v2.2l1.9-.6c.5.6.2 1.2-.9 1.6l-1 .4c.6 1.8 2 3.1 3.6 3.6-.4.8-1.6 1-2.6 1.2-.2.6-.3 1.2-.9 1.2-.8 0-1.6-.6-3-.2-.9.3-1.4 1.3-1.7 1.3s-.8-1-1.7-1.3c-1.4-.4-2.2.2-3 .2-.6 0-.7-.6-.9-1.2-1-.2-2.2-.4-2.6-1.2 1.6-.5 3-1.8 3.6-3.6l-1-.4c-1.1-.4-1.4-1-.9-1.6l1.9.6V8.3C7.4 5.7 9 3.5 12 3.5z" /></svg>,
  facebook: () => <svg {...S}><path d="M14.5 21v-7.5h2.6l.4-3h-3V8.7c0-.9.3-1.5 1.6-1.5h1.6V4.5c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.1H9v3h2.5V21" /></svg>,
  whatsapp: () => <svg {...S}><path d="M4 20l1.2-3.6A8 8 0 1 1 8 19z" /><path d="M9 9.5c.3 2.2 2.3 4.4 4.8 5l1.2-1.3 2 .8c-.2 1.3-1.4 2-2.6 1.8-3.4-.6-6.2-3.4-6.6-6.8-.1-1.1.6-2.3 1.8-2.5l.9 1.9z" /></svg>,
  phone: () => <svg {...S}><path d="M6.6 3.5h2.6l1.4 4-2 1.4a10 10 0 0 0 6.5 6.5l1.4-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16 16 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" /></svg>,
  pin: () => <svg {...S}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>,
  clock: () => <svg {...S}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  arrow: () => <svg {...S}><path d="M7 17L17 7M9 7h8v8" /></svg>,
};
