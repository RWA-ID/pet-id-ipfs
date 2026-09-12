"use client";
import { useState } from "react";
import { EmailSignIn } from "@/components/EmailSignIn";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { GOOGLE_CLIENT_ID, type PaySession } from "@/lib/pay";

/**
 * The two ways into an account: Google, or any email address via a one-time
 * code. Both end in the same session, and both resolve to the same account when
 * the address matches — so a buyer who used Google at checkout can get back in
 * by email, and sees the same orders.
 *
 * Google is offered first because it is one tap, but the email form is a peer,
 * not a fallback: plenty of people don't have a Google account.
 */
export function SignInPanel({
  onCredential,
  onSession,
  text = "continue_with",
}: {
  onCredential: (credential: string) => Promise<unknown>;
  onSession: (s: PaySession) => unknown;
  text?: "signin_with" | "continue_with";
}) {
  // Collapsed by default so the common path stays one tap, but the trigger says
  // plainly that any address works — a hidden option nobody finds is no option.
  const [emailOpen, setEmailOpen] = useState(false);

  return (
    <div style={{ display: "grid", justifyItems: "center", gap: "16px", width: "100%" }}>
      {GOOGLE_CLIENT_ID && <GoogleSignInButton onCredential={onCredential} text={text} />}

      {emailOpen ? (
        <>
          {GOOGLE_CLIENT_ID && <Divider />}
          <EmailSignIn onSession={onSession} />
        </>
      ) : (
        <button
          type="button"
          onClick={() => setEmailOpen(true)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "#8A6B4E",
            fontSize: "13px",
            fontFamily: "inherit",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          {GOOGLE_CLIENT_ID ? "Or sign in with any email address" : "Sign in with your email address"}
        </button>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        maxWidth: "320px",
        color: "#8A6B4E",
        fontSize: "12px",
      }}
    >
      <span style={{ flex: 1, height: "1px", background: "#E5D3B6" }} />
      or
      <span style={{ flex: 1, height: "1px", background: "#E5D3B6" }} />
    </div>
  );
}
