import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// Lets salon owners "Add to Home Screen" and open the app full-screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: "Bookings, link-in-bio page, quotes and rebooking for salons.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f3eadf",
    theme_color: "#a4452a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
