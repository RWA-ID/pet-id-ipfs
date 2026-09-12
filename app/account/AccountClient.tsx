"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { SignInPanel } from "@/components/SignInPanel";
import { usePaySession } from "@/hooks/usePaySession";
import { cardPaymentsEnabled, payApi, PayError, type OrderStatus, type PayOrder } from "@/lib/pay";

const STATUS: Partial<Record<OrderStatus, { label: string; color: string }>> = {
  pending: { label: "Waiting for payment", color: "#8A6B4E" },
  paid: { label: "Payment received · registering", color: "#C87A2E" },
  minting: { label: "Registering on-chain", color: "#C87A2E" },
  minted: { label: "Registered · held for you", color: "#2D7D46" },
  claim_requested: { label: "Sending to your wallet", color: "#C87A2E" },
  claiming: { label: "Sending to your wallet", color: "#C87A2E" },
  claimed: { label: "In your wallet", color: "#2D7D46" },
  refunded: { label: "Refunded", color: "#C0392B" },
  revoke_needed: { label: "Payment reversed", color: "#C0392B" },
  revoked: { label: "Payment reversed", color: "#C0392B" },
};
const MOVING = new Set<OrderStatus>(["pending", "paid", "minting", "claim_requested", "claiming"]);

const card: React.CSSProperties = {
  background: "#FFFDF8", border: "1px solid #E5D3B6", borderRadius: "24px",
  padding: "28px", boxShadow: "0 2px 12px rgba(61,40,23,.07)",
};
const btnPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
  padding: "12px 20px", borderRadius: "12px", fontWeight: 700, fontSize: "15px",
  fontFamily: "inherit", cursor: "pointer", border: "none", width: "100%",
  background: "#C87A2E", color: "#FFFDF8",
};
const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace" };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function AccountClient() {
  const { session, ready, signIn, adopt, signOut } = usePaySession();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [orders, setOrders] = useState<PayOrder[] | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const r = await payApi.me(session.token);
      setOrders(r.orders);
      setError("");
    } catch (e) {
      if (e instanceof PayError && e.status === 401) signOut();
      else setError(e instanceof Error ? e.message : String(e));
    }
  }, [session, signOut]);

  useEffect(() => {
    if (session) refresh();
    else setOrders(null);
  }, [session, refresh]);

  // Keep polling while anything is still moving through payment or the chain.
  const moving = !!orders?.some((o) => MOVING.has(o.status));
  useEffect(() => {
    if (!moving) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [moving, refresh]);

  return (
    <div style={{ minHeight: "100vh", background: "#FBF5EC", fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", color: "#3D2817" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Plus+Jakarta+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap');*{box-sizing:border-box;}`}</style>

      <header style={{ borderBottom: "1px solid rgba(229,211,182,.5)" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "0 24px", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <Link href="/" style={{ fontFamily: "'Fraunces',serif", fontWeight: 700, fontSize: "20px", color: "#3D2817", textDecoration: "none" }}>
            🐾 PetID
          </Link>
          {session && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", minWidth: 0 }}>
              <span style={{ color: "#8A6B4E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user.email}</span>
              <button onClick={signOut} style={{ background: "none", border: "none", color: "#8A6B4E", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: "13px" }}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 24px 80px" }}>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: "32px", letterSpacing: "-0.02em", margin: "0 0 8px" }}>Your PetID names</h1>
        <p style={{ color: "#5C3E25", fontSize: "15px", lineHeight: 1.6, margin: "0 0 28px" }}>
          Names you bought by card are registered right away and held safely for you. When you have a crypto
          wallet, send each one to it. It becomes yours permanently, at no cost.
        </p>

        {!cardPaymentsEnabled ? (
          <div style={card}>Card orders aren&apos;t available on this version of the site.</div>
        ) : !ready ? null : !session ? (
          <div style={{ ...card, textAlign: "center" }}>
            <p style={{ margin: "0 0 20px", color: "#5C3E25" }}>Sign in with the email address you used at checkout.</p>
            <SignInPanel onCredential={signIn} onSession={adopt} text="signin_with" />
          </div>
        ) : (
          <>
            {error && (
              <div role="alert" style={{ ...card, borderColor: "#E5C0C0", color: "#C0392B", marginBottom: "16px" }}>{error}</div>
            )}
            {isConnected && address && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", background: "#F5E6D0", borderRadius: "14px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px" }}>
                <span>Wallet connected: <span style={mono}>{short(address)}</span></span>
                <button onClick={() => disconnect()} style={{ background: "none", border: "none", color: "#8A6B4E", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>
                  Disconnect
                </button>
              </div>
            )}
            {orders === null ? (
              <div style={{ color: "#8A6B4E" }}>Loading your orders…</div>
            ) : orders.length === 0 ? (
              <div style={card}>
                No orders on this account yet. <Link href="/register/" style={{ color: "#C87A2E" }}>Create a PetID</Link>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "14px" }}>
                {orders.map((o) => (
                  <OrderCard key={o.id} order={o} token={session.token} onChanged={refresh} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function OrderCard({ order, token, onChanged }: { order: PayOrder; token: string; onChanged: () => Promise<void> }) {
  const { address } = useAccount();
  const { open } = useAppKit();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const status = STATUS[order.status] ?? { label: order.status, color: "#8A6B4E" };
  const live = ["minted", "claim_requested", "claiming", "claimed"].includes(order.status);

  const claim = async () => {
    if (!address) {
      open();
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const { message } = await payApi.claimMessage(token, order.id, address);
      // A free signature, not a transaction: it proves this wallet can receive the name.
      const signature = await signMessageAsync({ message });
      await payApi.claim(token, order.id, address, signature);
      await onChanged();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(/user rejected|denied|rejected the request/i.test(m) ? "Signature canceled. Nothing was sent." : m.slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
        <span style={{ ...mono, fontSize: "18px", fontWeight: 500, color: "#A35E1B", wordBreak: "break-all" }}>{order.name}</span>
        <span style={{ fontSize: "13px", fontWeight: 700, color: status.color }}>{status.label}</span>
      </div>

      {live && (
        <div style={{ marginTop: "8px", fontSize: "13px" }}>
          <a href={`https://${order.name}.limo`} target="_blank" rel="noopener noreferrer" style={{ color: "#C87A2E" }}>
            View profile
          </a>
          <span style={{ color: "#8A6B4E" }}> · also at {order.name}.link</span>
        </div>
      )}

      {order.status === "minted" && (
        <div style={{ marginTop: "18px" }}>
          {order.claimFailed && (
            <p style={{ fontSize: "13px", color: "#C0392B", margin: "0 0 10px", lineHeight: 1.5 }}>
              The last attempt to send this name didn&apos;t go through. Make sure the wallet can hold NFTs, then try again.
            </p>
          )}
          <button style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={claim}>
            {busy ? "Check your wallet…" : address ? `Send to ${short(address)}` : "Connect a wallet to claim"}
          </button>
          <p style={{ fontSize: "12px", color: "#8A6B4E", margin: "10px 0 0", lineHeight: 1.5 }}>
            You&apos;ll sign a free message to prove the wallet is yours. No transaction, no gas. Sending is permanent,
            so double-check it&apos;s the wallet you want.
          </p>
        </div>
      )}

      {(order.status === "claim_requested" || order.status === "claiming" || order.status === "claimed") && order.claimTo && (
        <div style={{ marginTop: "12px", fontSize: "13px", color: "#5C3E25" }}>
          {order.status === "claimed" ? "Sent to" : "Sending to"} <span style={mono}>{short(order.claimTo)}</span>
          {order.claimTx && (
            <>
              {" · "}
              <a href={`https://etherscan.io/tx/${order.claimTx}`} target="_blank" rel="noopener noreferrer" style={{ color: "#C87A2E" }}>
                transaction
              </a>
            </>
          )}
        </div>
      )}

      {order.status === "refunded" && (
        <p style={{ fontSize: "13px", color: "#5C3E25", margin: "10px 0 0" }}>
          Someone registered this name before your payment settled, so your card was refunded in full.
        </p>
      )}

      {err && <p role="alert" style={{ fontSize: "13px", color: "#C0392B", margin: "10px 0 0" }}>{err}</p>}
    </div>
  );
}
