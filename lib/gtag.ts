/**
 * Google Analytics 4 (gtag.js).
 *
 * Its own property, separate from the other sites'. The measurement ID is inlined into
 * the client bundle at build time, which is fine — a GA measurement ID is public by
 * design and is readable in the page source of every tagged site on the web. It is not
 * a credential.
 *
 * NOTE: this site ships a Content-Security-Policy, stamped into every page by
 * scripts/inject-csp.mjs. GA needs googletagmanager.com in `script-src` and
 * google-analytics.com in `connect-src`/`img-src`, and without them the tag is blocked
 * with **nothing in the console** — CSP violations do not surface in console.log-style
 * tooling. If analytics ever goes quiet, check the policy before anything else.
 */
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_ID ?? "G-0H7K3MVQL5";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Report one page_view for a client-side navigation.
 *
 * Only for route changes after the first paint: the `gtag('config')` call in the root
 * layout already reports the initial load, and reporting it here too would double every
 * landing in the session.
 */
export function gaPageView(path: string) {
  if (typeof window === "undefined" || !window.gtag || !GA_MEASUREMENT_ID) return;

  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
