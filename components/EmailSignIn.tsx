"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { payApi, PayError, type PaySession } from "@/lib/pay";

/** The worker's own cooldown between codes for one address (emailauth.ts). */
const RESEND_SECONDS = 60;

const muted = "#8A6B4E";
const line = "#E5D3B6";
const ink = "#3D2817";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: `1px solid ${line}`,
  background: "#FFFDF8",
  color: ink,
  fontSize: "15px",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 18px",
  borderRadius: "999px",
  border: "none",
  background: "#3D2817",
  color: "#FFFDF8",
  fontSize: "15px",
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
};

const linkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: muted,
  fontSize: "13px",
  fontFamily: "inherit",
  textDecoration: "underline",
  cursor: "pointer",
};

/**
 * Sign in with any email address, using a one-time code.
 *
 * Two steps in one component: the address, then the six digits. A code rather
 * than a magic link because this site is served from several origins and a link
 * would have to pick one — and because staying in this tab keeps a half-filled
 * registration form alive. See worker/src/pay/emailauth.ts.
 *
 * `onSession` receives the session the worker issued; the caller stores it.
 */
export function EmailSignIn({ onSession }: { onSession: (s: PaySession) => unknown }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  // The static export renders this signed-out. Until it hydrates, a submit
  // would be a native GET that puts the typed address in the URL and history,
  // so the buttons stay disabled until mount.
  const [mounted, setMounted] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const message = (e: unknown) =>
    e instanceof PayError || e instanceof Error ? e.message : String(e);

  const sendCode = useCallback(
    async (addr: string, { advance }: { advance: boolean }) => {
      setBusy(true);
      setError("");
      try {
        await payApi.emailStart(addr);
        setCooldown(RESEND_SECONDS);
        if (advance) {
          setStep("code");
          // Focus after the input exists.
          requestAnimationFrame(() => codeRef.current?.focus());
        }
      } catch (e) {
        setError(message(e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    await sendCode(addr, { advance: true });
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the six digits from the email.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const s = await payApi.emailVerify(email.trim(), digits);
      await onSession(s);
    } catch (e) {
      setError(message(e));
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={submitEmail} style={{ display: "grid", gap: "10px", width: "100%", maxWidth: "320px" }}>
        <label htmlFor="petid-email" style={{ fontSize: "13px", color: muted }}>
          Email address
        </label>
        <input
          id="petid-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          disabled={busy}
          style={inputStyle}
        />
        <button type="submit" disabled={busy || !mounted} style={{ ...btnStyle, opacity: busy || !mounted ? 0.6 : 1 }}>
          {busy ? "Sending…" : "Email me a code"}
        </button>
        {error && (
          <div role="alert" style={{ fontSize: "13px", color: "#C0392B", lineHeight: 1.5 }}>
            {error}
          </div>
        )}
        <div style={{ fontSize: "12px", color: muted, lineHeight: 1.5 }}>
          We&apos;ll send a six-digit code. No password to remember.
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitCode} style={{ display: "grid", gap: "10px", width: "100%", maxWidth: "320px" }}>
      <label htmlFor="petid-code" style={{ fontSize: "13px", color: muted, lineHeight: 1.5 }}>
        Enter the code we sent to <b style={{ color: ink }}>{email.trim()}</b>
      </label>
      <input
        id="petid-code"
        ref={codeRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        // Six digits, and the worker also enforces it. Space-tolerant because
        // the email shows the code as "123 456".
        pattern="[0-9 ]*"
        maxLength={7}
        required
        placeholder="123456"
        value={code}
        onChange={(ev) => setCode(ev.target.value)}
        disabled={busy}
        style={{ ...inputStyle, fontSize: "22px", letterSpacing: "6px", textAlign: "center", fontFamily: "'JetBrains Mono',monospace" }}
      />
      <button type="submit" disabled={busy || !mounted} style={{ ...btnStyle, opacity: busy || !mounted ? 0.6 : 1 }}>
        {busy ? "Checking…" : "Sign in"}
      </button>
      {error && (
        <div role="alert" style={{ fontSize: "13px", color: "#C0392B", lineHeight: 1.5 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap", marginTop: "2px" }}>
        <button
          type="button"
          disabled={busy || cooldown > 0}
          onClick={() => sendCode(email.trim(), { advance: false })}
          style={{ ...linkStyle, opacity: busy || cooldown > 0 ? 0.5 : 1, cursor: cooldown > 0 ? "default" : "pointer" }}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setStep("email");
            setCode("");
            setError("");
          }}
          style={linkStyle}
        >
          Use a different address
        </button>
      </div>
      <div style={{ fontSize: "12px", color: muted, lineHeight: 1.5, textAlign: "center" }}>
        The code expires in 10 minutes. Check your spam folder if it hasn&apos;t arrived.
      </div>
    </form>
  );
}
