// Public settings for the website and ads. Set these as Variables on the web service in
// Railway (they are read at build time, so Railway rebuilds after a change).
const env = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export const site = {
  // The brand name everywhere in the app and website. Set NEXT_PUBLIC_BRAND_NAME to rename.
  name: env(process.env.NEXT_PUBLIC_BRAND_NAME) ?? "Tressa",
  // WhatsApp number people can message for help, digits with country code: 971501234567
  supportWhatsApp: env(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP),
  // Shown on the Privacy and Terms pages and the website footer.
  contactEmail: env(process.env.NEXT_PUBLIC_CONTACT_EMAIL) ?? "hello@tressa.app",
  // Monthly price shown on the website, e.g. "49". Leave empty to hide the price.
  priceAED: env(process.env.NEXT_PUBLIC_PRICE_AED),
  trialDays: Number(env(process.env.NEXT_PUBLIC_TRIAL_DAYS) ?? 14),
  // Optional demo video for the website (YouTube video id, e.g. dQw4w9WgXcQ).
  demoYouTubeId: env(process.env.NEXT_PUBLIC_DEMO_YOUTUBE_ID),
  // Ad tracking. Google Ads: "AW-123456789" (+ the sign-up conversion label). Meta: pixel id digits.
  googleAdsId: env(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID),
  googleAdsSignupLabel: env(process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL),
  ga4Id: env(process.env.NEXT_PUBLIC_GA4_ID), // "G-XXXXXXX", optional
  metaPixelId: env(process.env.NEXT_PUBLIC_META_PIXEL_ID),
  // Legal: who runs the service (shown on Privacy/Terms). E.g. "Tressa, operated by <your trade licence name>, Dubai, UAE"
  operator: env(process.env.NEXT_PUBLIC_OPERATOR) ?? `${env(process.env.NEXT_PUBLIC_BRAND_NAME) ?? "Tressa"}, Dubai, United Arab Emirates`,
};

export function helpLink(text = `Hi, I need help with ${site.name}`) {
  return site.supportWhatsApp ? `https://wa.me/${site.supportWhatsApp.replace(/\D/g, "")}?text=${encodeURIComponent(text)}` : null;
}
