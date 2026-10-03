"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SignInPanel } from "@/components/SignInPanel";
import { usePaySession } from "@/hooks/usePaySession";
import {
  CARD_PRICE_CENTS, SHOP_COMMISSION_CENTS, cardPaymentsEnabled, payApi,
  type MyShop, type ShopForm,
} from "@/lib/pay";
import { normalizeShopCode } from "@/lib/ref";

/**
 * Pet-shop referrals: a shop signs up, prints a flyer with its own QR code, and
 * earns a commission on every card registration it sends us. The worker side
 * is worker/src/pay/shops.ts.
 *
 * Written for a shop owner who has never heard of ENS or a wallet: no crypto
 * words anywhere in the pitch, and every step says what happens next. The
 * wallet-based reseller program lives on /partner/ and is linked from the FAQ.
 */

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const COMMISSION = usd(SHOP_COMMISSION_CENTS).replace(".00", "");
const PRICE = usd(CARD_PRICE_CENTS);

/** "Paws & Co." → "PAWSCO": short enough to type off a flyer. */
function suggestCode(businessName: string): string {
  const s = businessName.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 16);
  return s.length >= 3 ? s.toUpperCase() : "";
}

const PAW = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
    <ellipse cx="20" cy="26" rx="9" ry="8"/><ellipse cx="9" cy="16" rx="4" ry="5"/><ellipse cx="31" cy="16" rx="4" ry="5"/><ellipse cx="15" cy="8" rx="3.2" ry="4"/><ellipse cx="25" cy="8" rx="3.2" ry="4"/>
  </svg>
);

const ARROW = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
);

const FAQ: [string, string][] = [
  ["How do I get paid?",
    "By bank transfer, through Stripe, the company that already processes PetID's card payments. Before your first payout we'll email you a link to add your bank details on Stripe's secure page. It takes about 5 minutes, and PetID never sees your bank details. Payouts go out once a month."],
  ["When does a registration count?",
    "As soon as the customer's card payment goes through and their pet's PetID is created, usually within a minute. If a customer is later refunded, that registration doesn't earn."],
  ["What if a customer doesn't scan the QR code?",
    "Your shop code is printed on the flyer, and customers can type it in on the last step before paying. A scan is also remembered for 30 days, so someone who scans today and signs up next week still counts for your shop."],
  ["Does it cost anything?",
    `No. It's free to join, there's no monthly fee and nothing to stock. Customers pay PetID ${PRICE} directly, the same price with or without your code, so you never handle money at the counter.`],
  ["Do my customers or I need to know about crypto?",
    "No. Customers pay by card and get a link and a QR tag; that's all they ever see. Only card registrations count toward your earnings."],
  ["I have more than one location.",
    "Sign up each location with its own email address. Each one gets its own flyer and code, so you can see which store is doing best."],
];

export default function ShopsPage() {
  const { session, ready, signIn, adopt, signOut } = usePaySession();
  const [mine, setMine] = useState<MyShop | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!session) { setMine(null); return; }
    let stale = false;
    setLoadError("");
    payApi.myShop(session.token)
      .then((r) => { if (!stale) setMine(r); })
      .catch((e) => {
        if (stale) return;
        // An expired session reads as 401: sign out so the sign-in button shows again.
        if (e?.status === 401) signOut();
        else setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => { stale = true; };
  }, [session, signOut]);

  const shop = mine?.shop ?? null;

  return (
    <div className="sh-page">
      <style>{CSS}</style>

      <header className="sh-nav sh-noprint">
        <div className="sh-shell sh-nav-inner">
          <Link href="/" className="sh-logo">
            <span className="sh-logo-mark">{PAW(20)}</span>
            PetID <span className="sh-pill">for Pet Shops</span>
          </Link>
          {session ? (
            <div className="sh-nav-right">
              <span className="sh-who">{session.user.email}</span>
              <button className="sh-link-btn" onClick={signOut}>Sign out</button>
            </div>
          ) : (
            <nav className="sh-nav-links" aria-label="On this page">
              <a href="#how">How it works</a>
              <a href="#faq">Questions</a>
              <a href="#signup">Sign up</a>
            </nav>
          )}
        </div>
      </header>

      {!cardPaymentsEnabled ? (
        <section className="sh-shell sh-narrow">
          <div className="sh-card">
            <h1 className="sh-h2">Shop sign-up isn&apos;t available on this copy of the site.</h1>
            <p className="sh-body">Visit <a href="https://petid.eth.limo/shops/">petid.eth.limo/shops</a> to sign up.</p>
          </div>
        </section>
      ) : shop && mine ? (
        <Dashboard mine={mine} token={session!.token} onSaved={setMine} />
      ) : (
        <>
          {!session && <Pitch />}
          <section className="sh-band" id="signup">
            <div className="sh-shell sh-narrow">
              {!ready || (session && !mine && !loadError) ? (
                <div className="sh-card sh-center"><p className="sh-body">Loading…</p></div>
              ) : loadError ? (
                <div className="sh-card sh-center">
                  <p className="sh-body">{loadError}</p>
                  <button className="sh-btn sh-btn-outline" style={{ marginTop: 16 }} onClick={() => location.reload()}>Try again</button>
                </div>
              ) : !session ? (
                <div className="sh-card">
                  <StepHead n={1} of={2} title="Sign in with your shop's email" />
                  <p className="sh-body" style={{ marginBottom: 22 }}>
                    This is where we&apos;ll send your payouts and any questions. Already registered a pet with PetID? Use the same sign-in.
                  </p>
                  <SignInPanel onCredential={signIn} onSession={adopt} />
                </div>
              ) : (
                <SignUpForm token={session.token} email={session.user.email} onSaved={setMine} />
              )}
            </div>
          </section>
        </>
      )}

      <p className="sh-foot sh-noprint">
        Questions? <a href="mailto:petid@onchain-id.id">petid@onchain-id.id</a> · <Link href="/">petid.eth</Link>
      </p>
    </div>
  );
}

// ─── Signed out: what this is ─────────────────────────────────────────────────

function Pitch() {
  return (
    <>
      <section className="sh-shell sh-hero">
        <div>
          <span className="sh-eyebrow"><i>{PAW(10)}</i> Free for pet shops</span>
          <h1 className="sh-h1">Earn <em>{COMMISSION}</em> for every pet registered from your counter.</h1>
          <p className="sh-lede">
            Put a free PetID flyer by your register. When a customer scans it and signs their pet up, your shop earns {COMMISSION}.
            We handle the payment, the setup and the customer support. You just leave the flyer out.
          </p>
          <div className="sh-cta-row">
            <a href="#signup" className="sh-btn sh-btn-primary">Get my free flyer {ARROW}</a>
            <a href="#how" className="sh-btn sh-btn-outline">How it works</a>
          </div>
          <div className="sh-trust">
            <span><b>✓</b> Free to join</span>
            <span><b>✓</b> Nothing to stock</span>
            <span><b>✓</b> Paid to your bank</span>
          </div>
        </div>
        <div className="sh-hero-art" aria-hidden="true">
          <figure className="sh-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/petshop.jpg" alt="" />
          </figure>
          <div className="sh-earn-chip">
            <div className="sh-mono">Your shop earns</div>
            <div className="sh-earn-amt">{COMMISSION} <small>per pet</small></div>
            <div className="sh-earn-sub">Customer pays {PRICE} by card</div>
          </div>
        </div>
      </section>

      <section className="sh-band sh-band-alt" id="how">
        <div className="sh-shell">
          <div className="sh-kicker">How it works</div>
          <h2 className="sh-h2" style={{ marginBottom: 26 }}>Three steps. About five minutes of your time.</h2>
          <div className="sh-grid-3">
            {[
              ["1", "Sign up", "Sign in with your shop's email and tell us your shop's name and address. No contract and nothing to buy."],
              ["2", "Print your flyer", "You instantly get a flyer with your shop's own QR code. Print it on any printer and put it by the register."],
              ["3", `Earn ${COMMISSION} per pet`, "Every customer who scans your code and registers their pet by card is credited to your shop. Watch them add up in your dashboard."],
            ].map(([n, title, body]) => (
              <div className="sh-card" key={n}>
                <div className="sh-step-num">{n}</div>
                <h3 className="sh-h3">{title}</h3>
                <p className="sh-body">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sh-band">
        <div className="sh-shell sh-grid-2">
          <div className="sh-card">
            <h2 className="sh-h2">What your customer gets</h2>
            <ul className="sh-list">
              <li><b>A profile page for their pet</b>: photo, health notes, vet details and how to reach the owner.</li>
              <li><b>A QR tag for the collar.</b> Anyone who finds a lost pet scans it and can call or message the owner in one tap.</li>
              <li><b>{PRICE}, once.</b> No subscription, paid by card, and ready in a few minutes on their own phone.</li>
            </ul>
          </div>
          <div className="sh-card">
            <h2 className="sh-h2">What you do</h2>
            <ul className="sh-list">
              <li><b>Leave the flyer out.</b> Customers sign up on their own phone, at the counter or later at home.</li>
              <li><b>Mention it, if you like.</b> &quot;Want a lost-pet tag for them? Scan this.&quot; is plenty.</li>
              <li><b>That&apos;s it.</b> No register to ring up, no stock, no customer support. We handle all of it.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="sh-band sh-band-alt" id="faq">
        <div className="sh-shell">
          <div className="sh-kicker">Questions</div>
          <h2 className="sh-h2" style={{ marginBottom: 22 }}>What shops usually ask.</h2>
          <div className="sh-grid-2">
            {[FAQ.slice(0, 3), FAQ.slice(3)].map((col, i) => (
              <div className="sh-card" key={i}>
                {col.map(([q, a]) => (
                  <div className="sh-faq" key={q}>
                    <div className="sh-faq-q">{q}</div>
                    <p className="sh-body">{a}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="sh-body" style={{ marginTop: 18, textAlign: "center" }}>
            Selling to customers who pay with crypto wallets, at your own price?{" "}
            <Link href="/partner/" style={{ color: "var(--amber-dark)" }}>See the reseller program</Link>.
          </p>
        </div>
      </section>
    </>
  );
}

function StepHead({ n, of, title }: { n: number; of: number; title: string }) {
  return (
    <>
      <div className="sh-mono" style={{ marginBottom: 8 }}>Step {n} of {of}</div>
      <h2 className="sh-h2">{title}</h2>
    </>
  );
}

// ─── Signed in, no shop yet ───────────────────────────────────────────────────

function SignUpForm({ token, email, onSaved }: { token: string; email: string; onSaved: (m: MyShop) => void }) {
  const [form, setForm] = useState<ShopForm>({ code: "", businessName: "", contactName: "", phone: "", address: "" });
  // The code follows the shop name until the owner types their own.
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof ShopForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm((f) => ({
      ...f,
      [k]: k === "code" ? v.toUpperCase().replace(/[^A-Z0-9-]/g, "") : v,
      ...(k === "businessName" && !codeTouched ? { code: suggestCode(v) } : {}),
    }));
    if (k === "code") setCodeTouched(true);
  };

  const codeOk = !!normalizeShopCode(form.code);
  const missing = [
    !form.businessName.trim() && "your shop's name",
    !form.contactName.trim() && "your name",
    !form.address.trim() && "your shop's address",
    !codeOk && "a shop code",
  ].filter(Boolean) as string[];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length || saving) return;
    setSaving(true);
    setError("");
    try {
      onSaved(await payApi.saveShop(token, form));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="sh-card" onSubmit={submit}>
      <StepHead n={2} of={2} title="Tell us about your shop" />
      <p className="sh-body" style={{ marginBottom: 22 }}>
        This goes on your flyer and tells us where to send your earnings. Signed in as <b>{email}</b>.
      </p>
      <div className="sh-form">
        <div className="sh-fw">
          <label className="sh-label" htmlFor="s-biz">Shop name</label>
          <input id="s-biz" className="sh-input" placeholder="Paws & Co" maxLength={60} value={form.businessName} onChange={set("businessName")} autoComplete="organization" />
        </div>
        <div>
          <label className="sh-label" htmlFor="s-name">Your name</label>
          <input id="s-name" className="sh-input" placeholder="Ana Reyes" maxLength={60} value={form.contactName} onChange={set("contactName")} autoComplete="name" />
        </div>
        <div>
          <label className="sh-label" htmlFor="s-phone">Phone <span>(optional)</span></label>
          <input id="s-phone" className="sh-input" placeholder="+1 305 000 0000" maxLength={40} value={form.phone} onChange={set("phone")} autoComplete="tel" />
        </div>
        <div className="sh-fw">
          <label className="sh-label" htmlFor="s-addr">Shop address</label>
          <input id="s-addr" className="sh-input" placeholder="12 Main St, Miami, FL 33101" maxLength={160} value={form.address} onChange={set("address")} autoComplete="street-address" />
        </div>
        <div className="sh-fw">
          <label className="sh-label" htmlFor="s-code">Your shop code</label>
          <input id="s-code" className="sh-input sh-code-input" placeholder="PAWSCO" maxLength={24} value={form.code} onChange={set("code")} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
          <p className="sh-hint">
            Printed on your flyer for customers who&apos;d rather type than scan. Letters and numbers, 3 to 24 characters.{" "}
            <b>It can&apos;t be changed later</b>, so pick one you like.
          </p>
        </div>
      </div>

      {error && <div className="sh-note sh-note-err" role="alert">{error}</div>}

      <button className="sh-btn sh-btn-primary sh-btn-block" type="submit" disabled={missing.length > 0 || saving} style={{ marginTop: 20 }}>
        {saving ? "Creating your flyer…" : <>Create my flyer {ARROW}</>}
      </button>
      {missing.length > 0 && <p className="sh-status">Still needed: {missing.join(", ")}.</p>}
      <p className="sh-status">Free, no contract. You can pause any time by emailing us.</p>
    </form>
  );
}

// ─── Signed in with a shop: flyer, numbers, details ──────────────────────────

function Dashboard({ mine, token, onSaved }: { mine: MyShop; token: string; onSaved: (m: MyShop) => void }) {
  const shop = mine.shop!;
  const stats = mine.stats!;
  const code = shop.code.toUpperCase();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <section className="sh-shell" style={{ padding: "36px 0 0" }}>
      <div className="sh-noprint">
        <div className="sh-kicker">Your shop</div>
        <h1 className="sh-h2" style={{ fontSize: 32 }}>{shop.businessName}</h1>
        <p className="sh-body" style={{ marginBottom: 24 }}>
          Shop code <b className="sh-code-chip">{code}</b> · You earn <b>{usd(shop.commissionCents)}</b> for every pet registered with it.
        </p>

        {shop.status === "paused" && (
          <div className="sh-note sh-note-err" style={{ marginBottom: 20 }}>
            Your shop is paused, so new registrations aren&apos;t being credited. Email petid@onchain-id.id to turn it back on.
          </div>
        )}

        <div className="sh-stats">
          <div className="sh-card sh-stat">
            <div className="sh-mono">Pets registered</div>
            <div className="sh-stat-num">{stats.registrations}</div>
          </div>
          <div className="sh-card sh-stat sh-stat-dark">
            <div className="sh-mono">You&apos;ve earned</div>
            <div className="sh-stat-num">{usd(stats.earnedCents)}</div>
          </div>
          <div className="sh-card sh-stat">
            <div className="sh-mono">Being set up now</div>
            <div className="sh-stat-num">{stats.onTheWay}</div>
          </div>
        </div>
        <div className="sh-note" style={{ margin: "16px 0 32px" }}>
          <b>Getting paid:</b>{" "}
          {shop.payoutsConnected
            ? "your bank is connected through Stripe. Earnings are paid out once a month."
            : <>before your first payout we&apos;ll email <b>{shop.email}</b> a link to connect your bank through Stripe. It takes about 5 minutes. Payouts go out once a month.</>}
        </div>
      </div>

      <div className="sh-dash">
        <div>
          <div className="sh-noprint" style={{ marginBottom: 14 }}>
            <h2 className="sh-h2">Your counter flyer</h2>
            <p className="sh-body">Print it, put it by the register, and you&apos;re done. Letter or A4 both work.</p>
          </div>
          <Flyer businessName={shop.businessName} code={code} qrUrl={mine.qrUrl!} />
          <div className="sh-cta-row sh-noprint" style={{ marginTop: 16 }}>
            <button className="sh-btn sh-btn-primary" onClick={() => window.print()}>Print flyer</button>
            <a className="sh-btn sh-btn-outline" href={mine.qrUrl} target="_blank" rel="noopener noreferrer">QR code only</a>
          </div>
        </div>

        <div className="sh-noprint" style={{ display: "grid", gap: 18, alignContent: "start" }}>
          <div className="sh-card">
            <h3 className="sh-h3">Share it online too</h3>
            <p className="sh-body" style={{ marginBottom: 12 }}>Post this link on your website or social media. Sign-ups through it count for your shop the same way.</p>
            <div className="sh-linkbox">{mine.link}</div>
            <button
              className="sh-btn sh-btn-outline sh-btn-block"
              style={{ marginTop: 10, padding: "11px 18px" }}
              onClick={() => { navigator.clipboard?.writeText(mine.link ?? "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
            >
              {copied ? "✓ Copied" : "Copy link"}
            </button>
          </div>

          <div className="sh-card">
            <h3 className="sh-h3">Recent registrations</h3>
            {stats.recent.length === 0 ? (
              <p className="sh-body">None yet. They&apos;ll show up here as soon as a customer signs up with your code.</p>
            ) : (
              <ul className="sh-recent">
                {stats.recent.map((r, i) => (
                  <li key={i}>
                    <span>{new Date(r.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                    <span className={r.state === "earned" ? "sh-earned" : "sh-processing"}>
                      {r.state === "earned" ? `+${usd(r.commissionCents)}` : "Setting up…"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sh-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <h3 className="sh-h3">Shop details</h3>
              {!editing && <button className="sh-link-btn" onClick={() => setEditing(true)}>Edit</button>}
            </div>
            {editing ? (
              <EditDetails mine={mine} token={token} onDone={(m) => { if (m) onSaved(m); setEditing(false); }} />
            ) : (
              <dl className="sh-dl">
                <dt>Contact</dt><dd>{shop.contactName}</dd>
                <dt>Email</dt><dd>{shop.email}</dd>
                {shop.phone && <><dt>Phone</dt><dd>{shop.phone}</dd></>}
                <dt>Address</dt><dd>{shop.address}</dd>
              </dl>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function EditDetails({ mine, token, onDone }: { mine: MyShop; token: string; onDone: (m?: MyShop) => void }) {
  const s = mine.shop!;
  const [form, setForm] = useState<ShopForm>({ code: s.code, businessName: s.businessName, contactName: s.contactName, phone: s.phone ?? "", address: s.address });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof ShopForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    setError("");
    try {
      onDone(await payApi.saveShop(token, form));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
      <input className="sh-input" aria-label="Shop name" value={form.businessName} onChange={set("businessName")} maxLength={60} />
      <input className="sh-input" aria-label="Your name" value={form.contactName} onChange={set("contactName")} maxLength={60} />
      <input className="sh-input" aria-label="Phone" placeholder="Phone (optional)" value={form.phone} onChange={set("phone")} maxLength={40} />
      <input className="sh-input" aria-label="Shop address" value={form.address} onChange={set("address")} maxLength={160} />
      <p className="sh-hint" style={{ margin: 0 }}>Your shop code ({s.code.toUpperCase()}) stays the same, so flyers you&apos;ve printed keep working.</p>
      {error && <div className="sh-note sh-note-err" role="alert">{error}</div>}
      <div className="sh-cta-row">
        <button className="sh-btn sh-btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button className="sh-link-btn" onClick={() => onDone()}>Cancel</button>
      </div>
    </div>
  );
}

/** The printed flyer. On paper it is the only thing on the page (see @media print). */
function Flyer({ businessName, code, qrUrl }: { businessName: string; code: string; qrUrl: string }) {
  return (
    <div className="sh-flyer">
      <div className="fl-brand"><span className="fl-mark">{PAW(22)}</span> PetID</div>
      <h2 className="fl-h">If your pet ever gets lost, help them find their way home.</h2>
      <p className="fl-sub">
        Create a profile for your dog or cat in minutes, with a QR tag for their collar. Whoever finds them scans it and can reach you in one tap.
      </p>
      <div className="fl-qr-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="fl-qr" src={qrUrl} alt={`QR code for ${businessName}'s PetID link`} />
        <div className="fl-qr-side">
          <div className="fl-scan">Scan with your phone camera</div>
          <ul className="fl-points">
            <li>{PRICE}, one time, pay by card</li>
            <li>Ready in about 5 minutes</li>
            <li>For dogs and cats</li>
          </ul>
          <div className="fl-code">Shop code <b>{code}</b></div>
        </div>
      </div>
      <div className="fl-foot">Available at <b>{businessName}</b> · petid.eth.limo</div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
:root{--cream:#FBF5EC;--cream-2:#F5E6D0;--amber:#C87A2E;--amber-dark:#A35E1B;--amber-soft:#E8A962;--brown:#3D2817;--brown-2:#5C3E25;--brown-3:#8A6B4E;--line:#E5D3B6;--white:#FFFDF8;--err:#B3412E;}
*{box-sizing:border-box;}
.sh-page{min-height:100vh;background:var(--cream);color:var(--brown);font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;line-height:1.5;}
.sh-shell{width:100%;max-width:1140px;margin:0 auto;padding:0 28px;}
.sh-narrow{max-width:640px;}
.sh-center{text-align:center;}

.sh-nav{position:sticky;top:0;z-index:20;background:rgba(251,245,236,.9);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(229,211,182,.6);}
.sh-nav-inner{display:flex;align-items:center;justify-content:space-between;height:66px;gap:16px;}
.sh-logo{display:inline-flex;align-items:center;gap:9px;font-family:'Fraunces',serif;font-weight:700;font-size:21px;color:var(--brown);text-decoration:none;white-space:nowrap;}
.sh-logo-mark{width:31px;height:31px;border-radius:9px;background:var(--amber);display:grid;place-items:center;color:var(--white);}
.sh-pill{font-size:12px;font-weight:600;color:var(--brown-3);background:var(--cream-2);border-radius:999px;padding:3px 10px;font-family:'Plus Jakarta Sans',sans-serif;}
.sh-nav-links{display:flex;gap:24px;font-size:14.5px;font-weight:500;}
.sh-nav-links a{color:var(--brown-2);text-decoration:none;}
.sh-nav-links a:hover{color:var(--amber-dark);}
.sh-nav-right{display:flex;align-items:center;gap:12px;min-width:0;}
.sh-who{font-size:13px;color:var(--brown-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sh-link-btn{background:none;border:none;cursor:pointer;font-size:13px;color:var(--brown-3);text-decoration:underline;font-family:inherit;padding:0;white-space:nowrap;}

.sh-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 13px 6px 8px;background:var(--white);border:1px solid var(--line);border-radius:999px;font-size:12.5px;font-weight:600;color:var(--brown-2);}
.sh-eyebrow i{width:16px;height:16px;border-radius:50%;background:var(--amber);display:grid;place-items:center;color:var(--white);}
.sh-h1{font-family:'Fraunces',serif;font-weight:600;font-size:clamp(36px,4.4vw,56px);line-height:1.04;letter-spacing:-.025em;margin:20px 0 18px;}
.sh-h1 em{font-style:normal;color:var(--amber-dark);}
.sh-lede{font-size:17.5px;line-height:1.6;color:var(--brown-2);max-width:52ch;margin:0 0 28px;}
.sh-h2{font-family:'Fraunces',serif;font-weight:600;font-size:26px;letter-spacing:-.02em;margin:0 0 8px;line-height:1.15;}
.sh-h3{font-family:'Fraunces',serif;font-weight:600;font-size:19px;letter-spacing:-.01em;margin:0 0 6px;}
.sh-body{font-size:15px;color:var(--brown-2);line-height:1.6;margin:0;}
.sh-body a{color:var(--amber-dark);}
.sh-kicker{font-family:'JetBrains Mono',monospace;font-size:11.5px;text-transform:uppercase;letter-spacing:.12em;color:var(--amber-dark);margin-bottom:10px;}
.sh-mono{font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--brown-3);}

.sh-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:15px 26px;border-radius:13px;font-weight:700;font-size:15.5px;font-family:inherit;cursor:pointer;border:1.5px solid transparent;text-decoration:none;transition:transform .15s ease,background .15s ease;white-space:nowrap;}
.sh-btn-primary{background:var(--amber);color:var(--white);box-shadow:0 8px 20px rgba(200,122,46,.3);}
.sh-btn-primary:hover{background:var(--amber-dark);transform:translateY(-1px);}
.sh-btn-outline{background:transparent;color:var(--brown);border-color:var(--brown);}
.sh-btn-outline:hover{background:var(--brown);color:var(--white);}
.sh-btn:disabled{opacity:.42;cursor:not-allowed;transform:none;box-shadow:none;}
.sh-btn-block{width:100%;}
.sh-cta-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;}

.sh-card{background:var(--white);border:1px solid var(--line);border-radius:22px;padding:28px;box-shadow:0 2px 12px rgba(61,40,23,.06);}
.sh-band{padding:52px 0;}
.sh-band-alt{background:var(--cream-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
.sh-note{background:var(--cream-2);border-radius:12px;padding:13px 16px;font-size:14px;color:var(--brown-2);line-height:1.6;}
.sh-note-err{background:#FBEBE4;color:var(--err);margin-top:16px;}

.sh-hero{display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center;padding:52px 28px 60px;}
.sh-trust{display:flex;gap:20px;flex-wrap:wrap;font-size:14px;color:var(--brown-3);margin-top:24px;}
.sh-trust b{color:var(--amber-dark);margin-right:4px;}
.sh-hero-art{position:relative;}
.sh-shot{margin:0;background:var(--white);border:1px solid var(--line);border-radius:20px;padding:10px;box-shadow:0 6px 22px rgba(61,40,23,.10);transform:rotate(1.6deg);}
.sh-shot img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:13px;display:block;}
.sh-earn-chip{position:absolute;left:-18px;bottom:-22px;background:var(--brown);color:var(--cream);border-radius:18px;padding:16px 22px;box-shadow:0 10px 26px rgba(61,40,23,.22);transform:rotate(-1.5deg);}
.sh-earn-chip .sh-mono{color:rgba(251,245,236,.6);}
.sh-earn-amt{font-family:'Fraunces',serif;font-weight:700;font-size:30px;color:var(--amber-soft);line-height:1.15;margin-top:4px;}
.sh-earn-amt small{font-size:15px;color:var(--cream);font-weight:600;}
.sh-earn-sub{font-size:12px;color:rgba(251,245,236,.62);margin-top:2px;}

.sh-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
.sh-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
.sh-step-num{width:38px;height:38px;border-radius:50%;background:var(--amber);color:var(--white);display:grid;place-items:center;font-family:'Fraunces',serif;font-weight:700;font-size:19px;margin-bottom:14px;}
.sh-list{margin:12px 0 0;padding-left:19px;display:grid;gap:10px;font-size:15px;color:var(--brown-2);line-height:1.55;}
.sh-list b{color:var(--brown);}
.sh-faq{padding:14px 0;border-top:1px dashed var(--line);}
.sh-faq:first-child{border-top:none;padding-top:0;}
.sh-faq-q{font-weight:700;font-size:15px;margin-bottom:4px;}

.sh-form{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.sh-fw{grid-column:1/-1;}
.sh-label{display:block;font-size:13.5px;font-weight:600;margin-bottom:6px;}
.sh-label span{color:var(--brown-3);font-weight:500;}
.sh-input{width:100%;border:1.5px solid var(--line);border-radius:10px;padding:12px 14px;outline:none;font-size:16px;font-family:inherit;background:var(--white);color:var(--brown);}
.sh-input:focus{border-color:var(--amber);box-shadow:0 0 0 3px rgba(200,122,46,.12);}
.sh-code-input{font-family:'JetBrains Mono',monospace;letter-spacing:.08em;font-weight:600;}
.sh-hint{font-size:12.5px;color:var(--brown-3);margin:6px 0 0;line-height:1.5;}
.sh-status{font-size:13px;color:var(--brown-3);margin:12px 0 0;text-align:center;}

.sh-code-chip{font-family:'JetBrains Mono',monospace;background:var(--cream-2);padding:2px 8px;border-radius:6px;letter-spacing:.06em;}
.sh-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
.sh-stat{padding:20px 22px;}
.sh-stat-num{font-family:'Fraunces',serif;font-weight:700;font-size:34px;line-height:1.1;margin-top:6px;}
.sh-stat-dark{background:var(--brown);border:none;color:var(--cream);}
.sh-stat-dark .sh-mono{color:rgba(251,245,236,.6);}
.sh-stat-dark .sh-stat-num{color:var(--amber-soft);}
.sh-dash{display:grid;grid-template-columns:1.15fr .85fr;gap:28px;align-items:start;}
.sh-linkbox{font-family:'JetBrains Mono',monospace;font-size:13px;background:var(--cream-2);border-radius:10px;padding:10px 12px;word-break:break-all;}
.sh-recent{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:0;}
.sh-recent li{display:flex;justify-content:space-between;padding:9px 0;border-top:1px dashed var(--line);font-size:14px;}
.sh-recent li:first-child{border-top:none;}
.sh-earned{font-weight:700;color:#2D7D46;}
.sh-processing{color:var(--brown-3);}
.sh-dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:10px 0 0;font-size:14px;}
.sh-dl dt{color:var(--brown-3);}
.sh-dl dd{margin:0;color:var(--brown);overflow-wrap:anywhere;}
.sh-foot{font-size:13px;color:var(--brown-3);text-align:center;padding:40px 0 56px;}
.sh-foot a{color:var(--amber-dark);}

/* ── the flyer: on screen a preview card, on paper the whole page ── */
.sh-flyer{background:#fff;color:#3D2817;border:1px solid var(--line);border-radius:18px;padding:34px 34px 26px;box-shadow:0 6px 22px rgba(61,40,23,.10);}
.fl-brand{display:flex;align-items:center;gap:9px;font-family:'Fraunces',serif;font-weight:700;font-size:22px;}
.fl-mark{width:34px;height:34px;border-radius:10px;background:#C87A2E;color:#fff;display:grid;place-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.fl-h{font-family:'Fraunces',serif;font-weight:700;font-size:clamp(24px,3vw,34px);line-height:1.1;letter-spacing:-.02em;margin:20px 0 10px;}
.fl-sub{font-size:15.5px;line-height:1.55;color:#5C3E25;margin:0 0 22px;}
.fl-qr-row{display:flex;gap:24px;align-items:center;}
.fl-qr{width:44%;max-width:240px;aspect-ratio:1;border:1px solid #E5D3B6;border-radius:12px;image-rendering:pixelated;}
.fl-qr-side{flex:1;min-width:0;}
.fl-scan{font-family:'Fraunces',serif;font-weight:700;font-size:19px;line-height:1.2;margin-bottom:10px;}
.fl-points{margin:0 0 14px;padding-left:18px;font-size:14.5px;line-height:1.7;color:#5C3E25;}
.fl-code{font-size:13.5px;color:#5C3E25;border:1.5px dashed #C87A2E;border-radius:10px;padding:8px 12px;display:inline-block;}
.fl-code b{font-family:'JetBrains Mono',monospace;font-size:17px;letter-spacing:.08em;color:#3D2817;margin-left:4px;}
.fl-foot{margin-top:22px;padding-top:14px;border-top:1px solid #E5D3B6;font-size:13.5px;color:#8A6B4E;text-align:center;}

@media (max-width:940px){
  .sh-hero{grid-template-columns:1fr;gap:48px;padding:36px 28px 56px;}
  .sh-hero-art{max-width:480px;}
  .sh-grid-3,.sh-grid-2,.sh-dash{grid-template-columns:1fr;}
  .sh-nav-links{display:none;}
}
@media (max-width:600px){
  .sh-shell{padding:0 16px;}
  .sh-hero{padding:28px 16px 48px;}
  .sh-form{grid-template-columns:1fr;}
  .sh-stats{grid-template-columns:1fr;}
  .sh-card{padding:22px;}
  .sh-cta-row .sh-btn{width:100%;}
  .sh-earn-chip{left:8px;bottom:-26px;}
  .sh-flyer{padding:24px 20px 20px;}
  .fl-qr-row{flex-direction:column;align-items:stretch;text-align:center;}
  .fl-qr{width:70%;margin:0 auto;}
  .fl-points{list-style:none;padding:0;}
  .sh-pill{display:none;}
}

@page{size:auto;margin:12mm;}
@media print{
  body{background:#fff !important;}
  .sh-page{background:#fff;min-height:0;}
  .sh-noprint{display:none !important;}
  .sh-dash{display:block;}
  .sh-shell{max-width:none;padding:0;}
  .sh-flyer{border:none;box-shadow:none;border-radius:0;padding:0;}
  .fl-brand{font-size:30px;}
  .fl-mark{width:46px;height:46px;border-radius:12px;}
  .fl-h{font-size:46px;margin:36px 0 18px;}
  .fl-sub{font-size:20px;margin-bottom:40px;}
  .fl-qr-row{gap:40px;}
  .fl-qr{width:52%;max-width:none;}
  .fl-scan{font-size:28px;margin-bottom:18px;}
  .fl-points{font-size:19px;}
  .fl-code{font-size:17px;padding:12px 16px;}
  .fl-code b{font-size:24px;}
  .fl-foot{margin-top:56px;font-size:17px;}
}
`;
