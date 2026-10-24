import { Brand } from "@/components/Brand";
import { BriskMark } from "@/components/Logo";

/** Sign-in pages: an ink panel with the Brisk mark on the left, the form on the right. Neutral, for every business. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-art" aria-hidden="true">
        <Brand light />
        <div className="auth-bigmark"><BriskMark size={460} tile="transparent" ink="#fff" spark="#fff" /></div>
        <div>
          <blockquote>Leads in. Quotes out. <em>Bookings done.</em></blockquote>
          <p>Enquiries, quotes clients accept on WhatsApp, a calendar for your team and follow-ups, in one place.</p>
          <ul className="auth-kinds">
            <li><i style={{ background: "#c0613f" }} />Salons</li>
            <li><i style={{ background: "#6f8fbf" }} />Real estate brokers</li>
          </ul>
        </div>
      </aside>
      <main className="auth-main">{children}</main>
    </div>
  );
}
