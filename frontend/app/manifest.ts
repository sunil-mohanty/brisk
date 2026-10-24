import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// Lets business owners "Add to Home Screen" and open the app full-screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: "Leads, quotes and bookings for salons and real estate brokers.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f4f2ee",
    theme_color: "#1d2330",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
