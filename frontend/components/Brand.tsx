import Link from "next/link";
import { site } from "@/lib/site";
import { BriskMark } from "./Logo";

/** Brisk mark + wordmark. On dark backgrounds pass light. */
export function Brand({ href = "/", className = "", light = false }: { href?: string; className?: string; light?: boolean }) {
  return (
    <Link href={href} className={`brand ${className}`.trim()} aria-label={`${site.name} home`}>
      <BriskMark size={30} tile={light ? "#fff" : "var(--fg)"} ink={light ? "var(--fg)" : "#fff"} />
      <span>{site.name}</span>
    </Link>
  );
}
