import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  const email = <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>;
  return (
    <LegalPage title="Terms of Service" updated="18 October 2026">
      <p>
        These terms are the agreement between your business and {site.operator} (&ldquo;{site.name}&rdquo;, &ldquo;we&rdquo;) for using {site.name}.
        By creating an account you accept them. Questions: {email}.
      </p>

      <h2>The service</h2>
      <p>
        {site.name} helps you record enquiries, take booking requests, manage appointments, send quotes as links, keep client records and send reminders. We may improve or change
        features over time. We aim to keep {site.name} available at all times but can&apos;t promise it will never be interrupted.
      </p>

      <h2>Free trial and payment</h2>
      <ul>
        <li>New accounts get a free trial of {site.trialDays} days unless we agree something different with you.</li>
        <li>After the trial, continued use needs a paid plan{site.priceAED ? ` (currently AED ${site.priceAED} per month)` : ""}. We&apos;ll tell you the price before you pay. Nothing is charged automatically.</li>
        <li>If a payment is overdue we may pause your account. While paused you can&apos;t sign in, but links your customers already have keep working. Paying switches it back on.</li>
        <li>Prices are in UAE dirhams.</li>
      </ul>

      <h2>Your account</h2>
      <ul>
        <li>Give accurate details and keep your password private. You&apos;re responsible for what happens under your account.</li>
        <li>One account is for one business.</li>
      </ul>

      <h2>Your customers&apos; information</h2>
      <p>
        You decide which customers to add. You confirm you have a proper reason to hold their details and to contact them, and that
        you&apos;ll respect anyone who asks you to stop. Our <a href="/privacy">Privacy Policy</a> explains how we handle this data for you.
      </p>

      <h2>Fair use</h2>
      <p>Don&apos;t use {site.name} to send spam or unwanted messages, to mislead people, for anything illegal in the UAE, or to try to access other businesses&apos; data or disrupt the service. We may suspend accounts that do.</p>

      <h2>Your data</h2>
      <p>
        Your business data stays yours. You can ask for a copy at any time. If you close your account we delete your data as described
        in the Privacy Policy.
      </p>

      <h2>Responsibility</h2>
      <p>
        Quotes, prices, VAT and records you create are your own; check them before sending. {site.name} is provided as it is. As far as the
        law allows, we are not liable for indirect losses such as lost profit, and our total liability is limited to the amount you
        paid us in the three months before the claim.
      </p>

      <h2>Ending the agreement</h2>
      <p>You can stop using {site.name} at any time and ask us to close your account. We can end it with 30 days&apos; notice, or straight away for serious breaches of these terms.</p>

      <h2>Changes and law</h2>
      <p>
        We&apos;ll give you notice in the app or by email before material changes take effect. These terms are governed by the laws of
        the United Arab Emirates as applied in the Emirate of Dubai, and the courts of Dubai have jurisdiction.
      </p>
    </LegalPage>
  );
}
