import { site } from "@/lib/site";
import type { PublicBusiness } from "@/lib/types";
import { BriskMark } from "@/components/Logo";

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

export function PubShell({ children, vertical }: { children: React.ReactNode; vertical?: string }) {
  return (
    <div className="pubpage" data-vertical={vertical === "real_estate" ? "real_estate" : "salon"}>
      <div className="pub">{children}</div>
    </div>
  );
}

export function Powered() {
  return <a className="powered" href="/" target="_blank" rel="noreferrer"><BriskMark size={16} tile="currentColor" ink="var(--pub-bg, #fff)" spark="var(--pub-bg, #fff)" />Made with {site.name}</a>;
}
