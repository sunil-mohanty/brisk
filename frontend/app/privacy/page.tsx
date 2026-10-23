import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const email = <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>;
  return (
    <LegalPage title="Privacy Policy" updated="18 October 2026">
      <p>
        This policy explains what information {site.name} collects, why, and what you can do about it. {site.name} is run by {site.operator}.
        Questions about privacy: {email}.
      </p>

      <h2>Who this is about</h2>
      <p>
        <b>Businesses</b> that sign up to {site.name} (&ldquo;you&rdquo;), and <b>their clients</b>, whose details a business adds to {site.name}
        to send them quotes and records. For customer details, the business decides what to add and why; {site.name} stores and processes
        them on the business&apos;s behalf.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Your account:</b> your name, email, password (stored only as a secure hash), business name, type of business, phone and WhatsApp number, and any address, tagline or TRN you add.</li>
        <li><b>What you put into {site.name}:</b> customers&apos; names, mobile numbers, emails and areas; leads, quotes, items and prices; service, order or appointment records; QR codes and links. Contacts are imported only when you pick them or upload a file.</li>
        <li><b>Usage:</b> the days you use {site.name} and key actions (for example &ldquo;quote created&rdquo;), so we can support you and improve the product. These records do not include your customers&apos; details.</li>
        <li><b>When customers open a link:</b> the time, the browser type, and a one-way scrambled code made from their network address, so a business can see that a quote was opened without counting the same person twice. We do not store the address itself.</li>
        <li><b>How you found us:</b> if you arrive from an ad or another site, we note the source (for example &ldquo;google&rdquo; or an ad campaign name) with your sign-up.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run the service: create quotes and links, show records to the right people, send password-reset emails.</li>
        <li>To support you and keep your account in good standing, including trials and payments.</li>
        <li>To understand which of our ads and pages work, using totals rather than looking at individuals.</li>
      </ul>
      <p>We do not sell personal information, and we do not message your customers ourselves. Messages to customers go from your own WhatsApp.</p>

      <h2>Cookies and similar</h2>
      <p>
        {site.name} stores a sign-in token and the ad source in your browser&apos;s storage. If we run advertising, our pages may also load
        Google&apos;s tag or Meta&apos;s pixel, which use cookies to measure whether ads lead to sign-ups. You can block these in your browser
        settings; {site.name} still works without them.
      </p>

      <h2>Who else handles data</h2>
      <p>
        We use trusted providers to run {site.name}: cloud hosting and database (Railway), email delivery for password resets (Resend), and,
        if enabled, ad measurement (Google, Meta). They process data only to provide their service to us. Some of them may store data
        outside the UAE.
      </p>

      <h2>How long we keep it</h2>
      <p>
        While your account is open. If you ask us to close your account, we delete your business&apos;s data within 30 days, except
        what we must keep for legal or accounting reasons.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>You can view and correct your business details and your customers&apos; details in the app at any time.</li>
        <li>You can ask us for a copy of your data, or to delete it, by emailing {email}.</li>
        <li>If you are a customer of a business that uses {site.name}, contact that business first; you can also contact us and we will pass your request on.</li>
      </ul>

      <h2>Keeping it safe</h2>
      <p>
        Connections are encrypted, passwords are hashed, each business can only see its own data, and customer links use long random
        codes. No system is perfectly secure, so please use a strong password and keep it private.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we&apos;ll tell you in the app or by email before it takes effect.</p>
    </LegalPage>
  );
}
