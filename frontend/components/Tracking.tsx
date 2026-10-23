import Script from "next/script";
import { site } from "@/lib/site";

/** Loads Google tag and Meta pixel only when their IDs are set. Nothing loads otherwise. */
export function Tracking() {
  const gIds = [site.googleAdsId, site.ga4Id].filter(Boolean) as string[];
  return (
    <>
      {gIds.length > 0 && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gIds[0]}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());${gIds.map((id) => `gtag('config',${JSON.stringify(id)});`).join("")}`}
          </Script>
        </>
      )}
      {site.metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(site.metaPixelId)});fbq('track','PageView');`}
        </Script>
      )}
    </>
  );
}
