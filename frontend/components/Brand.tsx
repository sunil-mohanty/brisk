import Link from "next/link";
import { site } from "@/lib/site";

/** Arch-mirror mark + wordmark. */
export function Brand({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`brand ${className}`.trim()} aria-label={`${site.name} home`}>
      <i className="mark" aria-hidden="true" />
      <span>{site.name}</span>
    </Link>
  );
}
