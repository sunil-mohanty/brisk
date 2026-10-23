import { Brand } from "@/components/Brand";

/** Sign-in pages: a clay panel with the mirror arch on the left, the form on the right. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-art" aria-hidden="true">
        <Brand />
        <div className="arch arch-frame" />
        <div>
          <blockquote>Your chair, booked. Your clients, back.</blockquote>
          <p>Bookings, a link page for your Instagram bio, quotes on WhatsApp and rebooking reminders, in one place.</p>
        </div>
      </aside>
      <main className="auth-main">{children}</main>
    </div>
  );
}
