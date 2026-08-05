"use client";
import { useEffect } from "react";

/**
 * Belt and braces for the meta refresh in page.tsx: `replace` keeps /apply/ out
 * of the back-button history, so leaving /partner/ goes where the visitor came
 * from instead of bouncing them straight back here.
 */
export function ApplyRedirect() {
  useEffect(() => {
    // Relative for the same reason as the meta refresh in page.tsx — a
    // root-relative "/partner/" leaves the site on a path-style IPFS gateway.
    window.location.replace("../partner/");
  }, []);
  return null;
}
