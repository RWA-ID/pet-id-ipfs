"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { gaPageView } from "@/lib/gtag";

/**
 * One GA page_view per client-side navigation.
 *
 * gtag('config') reports the initial load and nothing after it: every route change in
 * this app is a pushState the tag never observes, so without this /register — the whole
 * purchase funnel — never appears in a report, because it is almost always reached by a
 * client-side navigation from the homepage rather than a fresh document load.
 *
 * A client component here does not make the layout one: the layout stays a server
 * component, which is what keeps per-route metadata and OG cards working.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const seenFirstRender = useRef(false);

  useEffect(() => {
    // The initial load is gtag('config')'s to report, not ours.
    if (!seenFirstRender.current) {
      seenFirstRender.current = true;
      return;
    }
    gaPageView(pathname);
  }, [pathname]);

  return null;
}
