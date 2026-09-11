"use client";
import { useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID } from "@/lib/pay";

const GSI_SRC = "https://accounts.google.com/gsi/client";
let gsiLoading: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  gsiLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gsiLoading = null; // let a later mount try again
      reject(new Error("Google sign-in couldn't load. Check your connection or ad blocker and reload."));
    };
    document.head.appendChild(s);
  });
  return gsiLoading;
}

/**
 * Google's own Sign in with Google button. Google renders it inside an iframe
 * it controls, which is why the CSP names accounts.google.com/gsi/ for scripts,
 * frames, styles and connections (scripts/inject-csp.mjs).
 *
 * `onCredential` receives Google's ID token; the worker verifies it. Nothing
 * here trusts the token's contents.
 */
export function GoogleSignInButton({
  onCredential,
  text = "continue_with",
}: {
  onCredential: (credential: string) => Promise<unknown>;
  text?: "signin_with" | "continue_with";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handler = useRef(onCredential);
  handler.current = onCredential;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError("Google sign-in isn't configured on this version of the site.");
      return;
    }
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => {
            setBusy(true);
            setError("");
            try {
              await handler.current(credential);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          type: "standard", theme: "outline", size: "large", shape: "pill", text, width: 280,
        });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [text]);

  return (
    <div style={{ display: "grid", justifyItems: "center", gap: "10px" }}>
      <div ref={ref} style={{ minHeight: "44px", display: busy ? "none" : "block" }} />
      {busy && <div style={{ fontSize: "14px", color: "#8A6B4E" }}>Signing you in…</div>}
      {error && (
        <div role="alert" style={{ fontSize: "13px", color: "#C0392B", textAlign: "center", lineHeight: 1.5 }}>{error}</div>
      )}
    </div>
  );
}
