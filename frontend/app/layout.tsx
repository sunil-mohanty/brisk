import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Tracking } from "@/components/Tracking";
import { site } from "@/lib/site";

const title = `${site.name} – leads, quotes and bookings for small businesses`;
const description = "Enquiries from Instagram and ads, quotes clients accept on WhatsApp, and bookings that confirm themselves. For salons and real estate brokers in the UAE. Free trial.";

export const metadata: Metadata = {
  title: { default: title, template: `%s · ${site.name}` },
  description,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://tressa.app"),
  openGraph: { title, description, type: "website" },
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f2ee",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <head>
        <link rel="preload" href="/fonts/gloock-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/hanken-grotesk-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        {children}
        <Tracking />
      </body>
    </html>
  );
}
