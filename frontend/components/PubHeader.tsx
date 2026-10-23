import { site } from "@/lib/site";
import type { PublicBusiness } from "@/lib/types";

export function PubHeader({ business }: { business: PublicBusiness }) {
  return (
    <div className="bizhead">
      <div className="logo" aria-hidden="true">{business.initials}</div>
      <div>
        <b>{business.name}</b>
        {business.tagline && <span>{business.tagline}</span>}
      </div>
    </div>
  );
}

export function PubShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pubpage">
      <div className="pub">{children}</div>
    </div>
  );
}

export function Powered() {
  return <a className="powered" href="/" target="_blank" rel="noreferrer"><i className="mark" aria-hidden="true" />Made with {site.name}</a>;
}
