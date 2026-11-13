"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loading } from "@/components/ui";

/** "For many clients" is now part of New quote (step 2 takes one client or many). Old links land there. */
export default function BulkRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/quotes/new"); }, [router]);
  return <Loading />;
}
