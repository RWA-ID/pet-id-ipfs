# PetID — petid.eth

> A permanent, on-chain identity for your pet. Mint a `*.dogid.eth` or `*.catid.eth` ENS subname, get a beautiful profile page hosted forever on IPFS, and print a QR collar tag that helps strangers reunite you with your lost pet — no app, no account, no server.

**Live:** [petid.eth.link](https://petid.eth.link) · [petid.eth.limo](https://petid.eth.limo)

This is the **production PetID app**: a client-side dapp, statically exported and pinned to IPFS, served through the `petid.eth` contenthash. Buy with a **credit card** or with **crypto**. Crypto buyers mint straight from their own wallet — the site talks to Ethereum and Pinata and nothing else. Card buyers are served by two small Cloudflare Workers, because a static site on IPFS has nowhere to keep a Stripe key: [`worker/`](worker/) holds `petid-apply` (partner applications, IPFS upload proxy) and `petid-pay` (card checkout, custody, claims). Every pet profile is a self-contained HTML page on IPFS either way.

*(The sibling repo [`RWA-ID/pet-id`](https://github.com/RWA-ID/pet-id) is the retired fiat + crypto version — Cloudflare Pages, Supabase, Helio. Card payments now live here on Stripe instead. That repo still hosts the Hardhat workspace where the contracts in this README live. Both apps mint into the same registrar, so names are indistinguishable on-chain.)*

---

## How it works

```
 ┌─────────┐   ┌───────────────┐   ┌────────────────┐   ┌─────────────────┐
 │ Wizard  │──▶│ photo → IPFS  │──▶│ profile HTML   │──▶│ one wallet tx:  │
 │ 6 steps │   │ (Pinata, CIDv1)│  │ → IPFS (CIDv1) │   │ mint + contenthash │
 └─────────┘   └───────────────┘   └────────────────┘   └─────────────────┘
```

1. Owner connects a wallet, picks `dogid.eth` or `catid.eth`, checks subname availability (live `isAvailable` read against the registrar).
2. Chooses one of **four profile templates**, fills in pet + owner details.
3. On mint: the photo is uploaded to IPFS from the browser, the profile HTML is generated client-side (`lib/profile-html.ts`) and uploaded too, the CID is encoded into an ENS contenthash, and a **single transaction** registers the subname to the owner's wallet *and* sets the contenthash. Price is **$19.99 in ETH or USDC** — quoted in USD on-chain, so it doesn't drift with the ETH rate.
4. The profile resolves immediately at `https://<name>.dogid.eth.link` and the success screen offers a downloadable QR collar tag pointing there.

If the pet is ever lost, a stranger scans the collar QR and lands on the profile with one-tap **Call / WhatsApp / Telegram / Email** buttons.

---

## Profile templates

`lib/profile-html.ts` generates a fully standalone HTML page per pet — no framework, fonts + QR script from CDN, everything else inline. Four themes, selected in the wizard:

| id | name | look |
|---|---|---|
| `dog-rustic` | Rustic Pup | warm cream/bark serif, earthy |
| `dog-modern` | Modern Woof | black & white, Archivo 900, amber CTA |
| `cat-neon` | Neon Kitty | near-black, neon-green glow, mono type |
| `cat-soft` | Soft Paws | pastel pink→lavender gradient, rounded |

All templates are responsive: single column on phones, two-column layout with a sticky pet card from 900px up. All user input is HTML-escaped before interpolation.

**Preview them without minting:**

```bash
bun scripts/preview-templates.ts   # writes /tmp/petid-previews/<id>.html
```

Profile sections: found-banner (contact actions) · photo + bio · Identity (breed, color, age, sex, microchip) · Health (weight, vet, neutered, vaccinated, emergency notes) · Personality (favorites) · Owner (phone, WhatsApp, Telegram, email, wallet) · collar QR with download.

---

## Partner program (pet shops, vets, groomers)

Partners resell PetID registrations **at their own price** and keep the margin. Since v4 this is built into the registrar itself — a `partner` argument on the register call, priced by `quote(buyer, partner)`. There is **no separate router**; the old `PetIDPartnerRouter` belonged to v3 and is no longer used. Names minted via a partner are identical to direct registrations.

Two prices matter, both denominated in USD on-chain:

| | who pays it | default |
|---|---|---|
| **retail** | a walk-in customer on petid.eth | **$19.99** |
| **wholesale** | an approved partner, per registration | **$14.99** |

A partner sets any customer price at or above wholesale and keeps the difference. Wholesale is an **owner-approved allowlist** (`setWholesaler`), not open — otherwise any buyer could self-register and pocket the spread. The floor is wholesale rather than retail, so a partner may legally undercut petid.eth; that's deliberate.

> **Wholesale is never rendered before a wallet connects.** It's partner pricing, not public pricing — neither the landing page's "For businesses" section nor the disconnected `/partner/` page names a number. Both show an illustrative *margin* (`$10.00 on a $24.99 listing`) instead.

### Flow

1. Partner opens [`/partner`](https://petid.eth.link/partner/) — or the shareable shortcut [`/apply`](https://petid.eth.link/apply/), which redirects there — and connects the wallet that should receive earnings.
2. **Application.** Reseller access is an allowlist keyed to a wallet address, so the page shows an application form (business, contact, location, expected volume). It POSTs to the [`worker/`](worker/) endpoint, which stores it in KV and emails a notification. Until the wallet is approved on-chain the page stays in "application received".
3. Once approved, the same page becomes the dashboard: set a **business name** and **customer price** (≥ the wholesale rate) in one transaction and you're live.
4. Partner shares their link or embeds the widget. Every registration through it carries their address.
5. Margin accrues in the registrar under the partner's address in whichever asset the customer paid (ETH or USDC); one withdrawal claims both, anytime.

The wholesale rate is **only rendered after a wallet is connected** — it's partner pricing, not public pricing, so neither the landing page's "For businesses" section nor the disconnected partner page names a number.

### Applications

`/partner/` is one route with four states, driven entirely by chain reads: **public pitch** → **application form** (connected, not yet approved) → **application received** → **dashboard** (approved). There's no "sign up" — approval is an on-chain allowlist entry for the exact wallet that applied.

The form POSTs to [`worker/`](worker/) (`petid-apply`), the only server-side piece in the project, because a static IPFS export has nowhere to post. It writes each application to KV **before** attempting email, so a mail outage costs a notification and never a lead. A failed send is stamped onto the record as `notifyError` — `{"ok":true}` from the endpoint means *stored*, not *emailed*.

Read applications back:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://petid-apply.dmpay.workers.dev/applications | jq
```

Then approve a wallet with `setWholesaler(<address>, true)` on the registrar. Until that lands the applicant keeps seeing "application received".

If `NEXT_PUBLIC_PARTNER_APPLY_URL` is unset the form degrades to a prefilled `mailto:` plus a copyable text block, so the page is never a dead end.

### Embedding

```html
<!-- button (opens the wizard in a new tab) -->
<script src="https://unpkg.com/@petidentity/widget" data-partner="0xYOUR_WALLET"></script>

<!-- inline iframe -->
<script src="https://unpkg.com/@petidentity/widget" data-partner="0xYOUR_WALLET" data-mode="inline"></script>

<!-- or just a link -->
https://petid.eth.link/register/?partner=0xYOUR_WALLET
```

The widget package lives in [`widget/`](widget/) and is published as [`@petidentity/widget`](https://www.npmjs.com/package/@petidentity/widget) (zero dependencies, ~3 kB). Options: `data-label`, `data-theme` (`light|dark`), `data-mode` (`button|inline`), `data-target` (CSS selector).

When the wizard is opened with `?partner=0x…` it shows an "In partnership with `<name>`" banner and prices the mint at the partner's rate (with the breakdown on review) by passing that address as the `partner` argument. Attribution happens **inside the transaction**, so it can't be faked or forgotten.

---

## Card payments

Most pet owners don't have a crypto wallet, so card checkout is the default path on the site. It is served by **`petid-pay`** ([`worker/src/pay/`](worker/src/pay/), config `worker/wrangler.pay.toml`) — a second worker, deliberately separate from `petid-apply`: a payments deploy must never be able to break the live site's photo uploads, and the fulfiller key has no business sitting in a worker that accepts file uploads from the internet.

```
 sign in (Google)  →  Stripe Checkout  →  webhook  →  mintCustodial (name held by the registrar)
                                                          ↓
        buyer connects a wallet later and signs a message → releaseCustodial → name is theirs, permanently
```

- **The buyer needs no wallet to buy.** The name is minted into the registrar's own custody with **no fuses burned**, so a refunded or disputed order can still be revoked. The profile is live immediately either way.
- **Claiming is free and irreversible.** The buyer signs a plain message proving they control the destination wallet — that signature is what stops a mistyped address from receiving the name. The release burns `CANNOT_UNWRAP | PARENT_CANNOT_CONTROL`, so a claimed name is indistinguishable from one bought with crypto, and nobody can take it back.
- **One name, one live order.** A D1 partial unique index reserves `(parent, label)` for the duration of a checkout; two people can't both pay for the same name. If a name is registered by someone else before the mint lands, the card is refunded automatically.
- **Chain writes are serialised.** The fulfiller is a single EOA, so `processQueue()` holds a D1 lease and keeps one transaction in flight; a cron runs every minute to confirm receipts, retry, and expire abandoned checkouts. Failures that block *every* order (a missing NameWrapper approval) don't consume an individual order's retries.
- **Money moved, name didn't?** A refund or dispute after minting flags the order `revoke_needed` and emails the admin; revoking is owner-only on-chain, then `POST /admin/orders/<id>/revoked` frees the name here.
- **Gas is the only on-chain cost**: a full card sale (mint + claim) measured **291,538 + 66,371 gas ≈ $0.04** at 0.05 gwei. The fulfiller wallet holds gas money and nothing else; it emails when it drops below 0.001 ETH.

Secrets live as Wrangler secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SESSION_SECRET`, `FULFILLER_PRIVATE_KEY`, `RPC_URL`, `RESEND_API_KEY`, `ADMIN_TOKEN`). Sessions are bearer tokens in `localStorage`, not cookies — the site and the worker sit on different registrable domains, and Safari drops third-party cookies.

**Testing it without spending money:**

```bash
cd worker
FORK_URL=<mainnet rpc> node scripts/pay-e2e.mjs
```

anvil forks mainnet, `wrangler dev` runs the worker against a local D1, and the script plays Stripe with signed webhooks: 33 checks covering forged signatures, replayed webhooks, per-account privacy, wrong-wallet claims, permanent fuses on release, and refund → revoke → name for sale again.

---

## Contracts (Ethereum mainnet)

| Contract | Address | Role |
|---|---|---|
| **`PetIDRegistrarV5`** | [`0xe189666820863F6e7c578c81eFd7ED9eAb24d1bb`](https://etherscan.io/address/0xe189666820863F6e7c578c81eFd7ED9eAb24d1bb#code) | **live**, verified — everything v4 does, plus **custody for card orders**: `mintCustodial` / `releaseCustodial` / `revokeCustodial`, driven by a `fulfiller` hot wallet |
| `PetIDRegistrarV4` | [`0xfe4059C99e510C2A039949e77c7c38D7ee99ac53`](https://etherscan.io/address/0xfe4059C99e510C2A039949e77c7c38D7ee99ac53#code) | superseded 2026-09-11 — its NameWrapper approval was revoked, so it can no longer mint |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | payment asset; `registerWithUsdcPermit` avoids a separate approve tx |
| ENS `NameWrapper` | `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401` | wraps `dogid.eth` / `catid.eth`; subnames are wrapped ERC-1155s |
| `PetSubnameRegistrar` v3 | [`0xfd428E9188c9D858D48Ca2fEE9199Cc2d66D61C1`](https://etherscan.io/address/0xfd428E9188c9D858D48Ca2fEE9199Cc2d66D61C1#code) | superseded — fixed ETH fee, no USDC, no built-in reseller |
| `PetIDPartnerRouter` | `0x62a1731fA5fC1c208825308Bf2715D42Cd598166` | superseded — v4 folded partner pricing into the registrar |

`dogid.eth` and `catid.eth` are owned by a 2-of-3 Safe, which has granted `setApprovalForAll` to v5. **One approval covers both parents** — `isApprovedForAll` is keyed on owner+operator, not per token. Deploying a new registrar therefore takes a Safe transaction before it can mint anything: without it every mint reverts with `Registrar not approved on NameWrapper`, which is exactly how the first live card order failed.

- **Pricing is USD-denominated and oracle-read.** `quote(buyer, partner)` returns `(usdCents, weiAmount, usdcAmount)` — always read live, never hardcoded. USDC is charged exactly; the ETH leg floats with the rate and **excess is refunded in the same transaction**, so the UI sends a small buffer rather than risking a revert on a rate move.
  - *Why v4 exists:* v3's fixed `0.00825 ETH` fee had drifted to **$15.39**, not the intended $19.99 — walk-ins were paying roughly the reseller price. Pinning prices to USD is the fix.
- **Margin math:** partner sets `price ≥ wholesale`; customer pays `price`; partner accrues `price − wholesale − platformCut`. `platformFeeBps` applies to the **margin only** (currently `0`, hard-capped at 30%). Margin accrues in whichever asset the customer paid, and one `withdrawEarnings` claims both. If wholesale is ever raised above a partner's listed price their **margin degrades to zero rather than reverting** — checkout keeps working, earning nothing, instead of breaking.
- **Fuses:** direct registrations burn `CANNOT_UNWRAP | PARENT_CANNOT_CONTROL` (`1 << 16` — *not* `1 << 17`, which is `IS_DOT_ETH`). Ownership is permanent and irrevocable; even the parent can't touch it.
- **Ownership:** `Ownable2Step`, so the Safe must `acceptOwnership()`; `renounceOwnership()` reverts. Admin ownership of v4 is **still on the deployer EOA** — deliberately deferred so fixes stay one transaction instead of a 2-of-3.
- Contract source, deploy script and the **16-test mainnet-fork suite** live in `RWA-ID/pet-id` under `contracts/`:
  `FORK=1 npx hardhat test test/PetIDRegistrarV4.fork.test.cjs`
  Fork tests pin a block via `FORK_BLOCK` — Hardhat forks the *safe* head (~32 blocks back), so a transaction confirmed seconds ago is invisible and every mint reverts with `Registrar not approved on NameWrapper`.

---

## Repository layout

```
petid-eth-ipfs/
├── app/
│   ├── page.tsx                landing page
│   ├── register/page.tsx       6-step wizard (single page — safe for IPFS gateways)
│   │                           steps: pay by card or wallet → name → template → details
│   │                                  → review → pay/mint, then the Stripe return screen
│   │                           partner mode via ?partner=0x… (card checkout is hidden there)
│   ├── partner/page.tsx        partner program: pitch → apply → dashboard, one route
│   │   partner/layout.tsx      route metadata + share card (page.tsx is a client component)
│   ├── apply/page.tsx          shareable shortcut; relative meta-refresh to ../partner/
│   ├── account/                card orders: sign in with Google, claim a name to a wallet
│   ├── privacy/page.tsx        privacy policy (public IPFS profiles, Google, Stripe)
│   ├── terms/page.tsx          terms of service (custody, claims, refunds, Delaware)
│   ├── layout.tsx, providers.tsx (wagmi + Reown AppKit), globals.css
├── hooks/
│   └── useRegistrarV4.ts       the whole v4 surface: quote, registerWithEth/Usdc(+Permit),
│                               partnerInfo, setPartnerPrice, withdrawEarnings,
│                               useWholesalerStatus (approved + isLoading)
├── lib/
│   ├── profile-html.ts         themed profile page generator (4 templates)
│   ├── templates/registry.ts   template metadata + picker swatches
│   ├── pinata-browser.ts       Pinata v3 Files API upload from the browser (CIDv1)
│   ├── contenthash.ts          CID → ENS contenthash bytes (browser-safe, no Buffer)
│   ├── pay.ts                  petid-pay client: Google sign-in, checkout, orders, claims
│   └── (hooks/usePaySession.ts + components/GoogleSignInButton.tsx alongside)
│   ├── seo.ts                  pageMetadata() — every route's title/canonical/share card
│   └── wagmi.ts                chains + WalletConnect config
├── widget/                     @petidentity/widget npm package (vanilla JS, no build)
├── worker/                     two Cloudflare Workers, one package
│   ├── src/index.ts            petid-apply — partner applications → KV + email, IPFS upload proxy
│   ├── src/pay/                petid-pay — Google sign-in, Stripe checkout, custody, claims
│   ├── migrations/pay/         D1 schema for orders (wrangler.pay.toml)
│   └── scripts/pay-e2e.mjs     end-to-end test: anvil fork + wrangler dev + signed webhooks
├── scripts/
│   ├── deploy-ipfs.mjs         uploads out/ to Pinata as one directory, prints CID
│   ├── og/card.html + render.sh share cards → public/og/*.png (headless Chrome + sips)
│   ├── icons/paw.html + render.sh + make-ico.py  favicon set → public/ (hand-rolled ICO)
│   ├── verify-meta.mjs         asserts per-route canonical/og:url/og:image in out/
│   └── preview-templates.ts    renders sample profiles for all templates
├── types/, next.config.ts, tsconfig.json (target ES2020 — bigint literals)
```

---

## Local development

```bash
bun install
bun run dev          # http://localhost:3000
bun run build        # static export → out/   (Next 16 / Turbopack)
bun run deploy       # build + pin out/ to Pinata → prints CID
```

`.env.local` (see `.env.example`):

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=   # Reown project id
NEXT_PUBLIC_PETID_REGISTRAR_V4_ADDRESS=0xe189666820863F6e7c578c81eFd7ED9eAb24d1bb   # v5; the var keeps its old name
NEXT_PUBLIC_USDC_ADDRESS=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
NEXT_PUBLIC_RPC_URL_MAINNET=            # public RPC is fine
NEXT_PUBLIC_PINATA_GATEWAY=https://ipfs.onchain-id.id
NEXT_PUBLIC_UPLOAD_API=                 # worker/ — proxies photo + profile uploads to Pinata
NEXT_PUBLIC_PARTNER_APPLY_URL=          # worker/ endpoint; unset ⇒ the form falls back to email
NEXT_PUBLIC_PAY_API=                    # petid-pay worker; unset ⇒ no card checkout is offered
NEXT_PUBLIC_GOOGLE_CLIENT_ID=           # Sign in with Google, for card orders
```

> **No Pinata key ships to the browser any more.** It used to, as `NEXT_PUBLIC_PINATA_JWT` — and that bundle is pinned to IPFS, which cannot be unpublished, so the key was permanently readable by anyone who looked. Uploads now go through `POST /upload` on the `petid-apply` worker, which holds a PetID-only, pin-only key as a Wrangler secret. Never reintroduce a `NEXT_PUBLIC_` secret: that prefix compiles the value into a public, permanent artifact.

---

## Deploying to petid.eth

1. `bun run deploy` — builds and pins `out/` to Pinata, prints the CIDv1 (`bafy…`).
2. `node scripts/verify-meta.mjs` — asserts every route's canonical, `og:url`, share card and icon links against the **built** HTML. Both failures it catches are invisible in the `.tsx` (see Gotchas), so run it before pinning.
3. Set the new CID as the `contenthash` of `petid.eth` (ENS manager → Records → contenthash → `ipfs://<cid>`).
4. The site itself is reachable on `.link` and `.limo` as soon as the tx confirms — those certificates already exist. A **newly minted pet name** is different: each one needs its own certificate, and `.link` has taken hours where `.limo` took minutes.
5. If the deploy changed the registrar, the Safe must `setApprovalForAll(newRegistrar, true)` on the NameWrapper **before** the contenthash goes up, and revoke the old one immediately after.

Regenerating brand assets (only when the design changes — the PNGs are committed):

```bash
scripts/og/render.sh              # all four share cards, or: scripts/og/render.sh partner
scripts/icons/render.sh           # favicon.ico (16/32/48) + icon-512 + apple-touch-icon
```

Pet profile pages are pinned individually at mint time and are **immutable** — redeploying the app never touches existing profiles.

---

## Gotchas (hard-won)

- **`writeContractAsync`, not `writeContract`.** The wizard runs async IPFS uploads between the click and the wallet popup; `writeContract` loses the user-gesture chain and the popup never appears.
- **Failed mint ≠ lost uploads.** The pipeline caches the photo/profile CIDs in state; "Retry transaction" resubmits only the tx. Any edit to the form invalidates the cache. `reset()` from `useWriteContract` must be called before retrying or the stale error instantly re-flags the UI.
- **CIDv1 only.** Pinata uploads must use `cidVersion: 1`; CIDv0 breaks ENS contenthash resolution. Contenthash = varint multicodec prefix + CID bytes (`lib/contenthash.ts`).
- **`.limo`, not `.link`, in QR codes and profile links.** Both gateways serve every name, but a freshly minted name needs a TLS certificate issued per name: `.limo` had one within ~20 minutes while `.link` still failed the handshake (curl exit 35) two hours later. A collar QR is printed once and scanned by a stranger, so it points at `.limo`; the UI says both work. The marketing site keeps its `.link` canonical.
- **`tsconfig` targets ES2020** — wagmi/viem code uses bigint literals (`0n`); ES2017 fails the build.
- **`next: latest`** — the build floats with Next releases (16.x/Turbopack as of 2026-07). A cold build takes ~10 min on an M-series laptop; warm cache ~half.
- **Hardhat + some RPCs:** `deploy()` can throw inside `formatTransactionResponse` *after* broadcasting. Before re-sending, derive the CREATE address from the deployer nonce and check for code — the contract is probably already there.
- **Root-relative paths break on path-style IPFS gateways.** At `gateway/ipfs/<cid>/apply/`, an `href="/partner/"` escapes the site entirely. `/apply/`'s redirect uses `../partner/` for exactly this reason.
- **Next *replaces* `openGraph`/`twitter`, it does not deep-merge them.** A page that restates `openGraph: { title }` silently drops the inherited `images` and ships a card with no picture — nothing errors and the source looks right. All route metadata goes through `pageMetadata()` in `lib/seo.ts` so it can't regress, and `verify-meta.mjs` asserts it against the built HTML.
- **Icons live in `public/`, not `app/`.** Turbopack *decodes* an `app/favicon.ico` at build time and rejects any embedded PNG that isn't RGBA (`The PNG is not in RGBA format!`); headless Chrome writes colour type 2 for an opaque page. `public/` is copied verbatim, so the `<link>` tags are declared by hand in `app/layout.tsx`.
- **A 16px paw needs three toes, not four.** Four toes plus their gaps get ~4px each, antialias into one band, and the mark reads as a cup. `scripts/icons/paw.html` carries a separate geometry for the 16px member.
- **Patching built HTML to preview a CSS tweak does nothing** for a client component — hydration replaces the DOM with the bundled stylesheet and the screenshot comes back identical, which looks exactly like a failed fix. Edit the source and rebuild.
- **`useWholesalerStatus`, not the bare boolean.** A `false` from an in-flight contract read is indistinguishable from "not approved", so branching on it flashes the application form at an already-approved partner.

---

## License

All rights reserved. Widget package (`widget/`) is MIT.
