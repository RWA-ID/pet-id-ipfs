# PetID — petid.eth

> A permanent, on-chain identity for your pet. Mint a `*.dogid.eth` or `*.catid.eth` ENS subname, get a beautiful profile page hosted forever on IPFS, and print a QR collar tag that helps strangers reunite you with your lost pet — no app, no account, no server.

**Live:** [petid.eth.link](https://petid.eth.link) · [petid.eth.limo](https://petid.eth.limo)

This is the **production PetID app**: a fully client-side dapp, statically exported and pinned to IPFS, served through the `petid.eth` contenthash. There is no backend of any kind — wallets talk to Ethereum, browsers talk to Pinata, and every pet profile is a self-contained HTML page on IPFS.

*(The sibling repo [`RWA-ID/pet-id`](https://github.com/RWA-ID/pet-id) is the paused fiat + crypto version — Cloudflare Pages, Supabase, Helio — awaiting a new payment merchant. It also hosts the Hardhat workspace where the contracts in this README live. Both apps mint into the same registrar, so names are indistinguishable on-chain.)*

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
3. On mint: the photo is uploaded to IPFS from the browser, the profile HTML is generated client-side (`lib/profile-html.ts`) and uploaded too, the CID is encoded into an ENS contenthash, and a **single transaction** registers the subname to the owner's wallet *and* sets the contenthash.
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

Partners resell PetID registrations **at their own price** and keep the margin. Everything is on-chain through `PetIDPartnerRouter` — the live registrar is untouched, and names minted via a partner are identical to direct registrations.

### Flow

1. Partner opens [`/partner`](https://petid.eth.link/partner/), connects the wallet that should receive earnings, sets a **business name** and **customer price** (≥ the protocol fee). One transaction, instantly live.
2. Partner shares their link or embeds the widget. Every registration through it carries their address.
3. The router forwards the protocol fee to the registrar (which mints straight to the customer and sets the contenthash), delivers the wrapped subname NFT to the customer, and credits the margin to the partner (pull-payment).
4. Partner withdraws accrued ETH from the dashboard anytime.

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

When the wizard is opened with `?partner=0x…` it shows an "In partnership with `<name>`" banner, prices the mint at the partner's rate (with the protocol-fee breakdown on review), and routes the transaction through the router instead of the registrar.

---

## Contracts (Ethereum mainnet)

| Contract | Address | Role |
|---|---|---|
| `PetSubnameRegistrar` v3 | [`0xfd428E9188c9D858D48Ca2fEE9199Cc2d66D61C1`](https://etherscan.io/address/0xfd428E9188c9D858D48Ca2fEE9199Cc2d66D61C1#code) | mints subnames, sets contenthash, holds the protocol fee |
| `PetIDPartnerRouter` | [`0x62a1731fA5fC1c208825308Bf2715D42Cd598166`](https://etherscan.io/address/0x62a1731fA5fC1c208825308Bf2715D42Cd598166#code) | partner pricing, margin accounting, withdrawals |
| ENS `NameWrapper` | `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401` | wraps `dogid.eth` / `catid.eth`; subnames are wrapped ERC-1155s |

- **Protocol fee:** `registrationFee()` on the registrar — currently **0.00825 ETH** — always read live, never hardcoded.
- **Fuses:** direct registrations burn `CANNOT_UNWRAP | PARENT_CANNOT_CONTROL` (`1 << 16` — *not* `1 << 17`, which is `IS_DOT_ETH`). Ownership is permanent and irrevocable; even the parent can't touch it.
- **Router margin math:** partner sets `price ≥ baseFee`; customer pays `price`; partner accrues `price − baseFee − platformCut`. `platformFeeBps` applies to the **margin only** (currently `0`, hard-capped at 30%). Excess payment is refunded in the same tx.
- Contract sources, deploy script and the **9-test mainnet-fork suite** live in `RWA-ID/pet-id` under `contracts/`:
  `FORK=1 npx hardhat test test/PetIDPartnerRouter.fork.test.cjs`

---

## Repository layout

```
petid-eth-ipfs/
├── app/
│   ├── page.tsx                landing page
│   ├── register/page.tsx       6-step wizard (single page — safe for IPFS gateways)
│   │                           steps: wallet → name → template → details → review → mint
│   │                           partner mode via ?partner=0x…
│   ├── partner/page.tsx        partner dashboard: price/name, earnings, withdraw, embed snippets
│   ├── layout.tsx, providers.tsx (wagmi + RainbowKit), globals.css
├── hooks/
│   ├── useRegister.ts          direct mint via registrar (writeContractAsync)
│   └── usePartnerRouter.ts     partnerInfo / registerViaPartner / setPartner / withdraw
├── lib/
│   ├── profile-html.ts         themed profile page generator (4 templates)
│   ├── templates/registry.ts   template metadata + picker swatches
│   ├── pinata-browser.ts       Pinata v3 Files API upload from the browser (CIDv1)
│   ├── contenthash.ts          CID → ENS contenthash bytes (browser-safe, no Buffer)
│   └── wagmi.ts                chains + WalletConnect config
├── widget/                     @petidentity/widget npm package (vanilla JS, no build)
├── scripts/
│   ├── deploy-ipfs.mjs         uploads out/ to Pinata as one directory, prints CID
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
NEXT_PUBLIC_PETID_REGISTRAR_ADDRESS=0xfd428E9188c9D858D48Ca2fEE9199Cc2d66D61C1
NEXT_PUBLIC_PETID_ROUTER_ADDRESS=0x62a1731fA5fC1c208825308Bf2715D42Cd598166
NEXT_PUBLIC_RPC_URL_MAINNET=            # public RPC is fine
NEXT_PUBLIC_PINATA_JWT=                 # scoped JWT, Files:write ONLY — it ships to browsers
NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud
```

> **The Pinata JWT is public by design** (browser uploads). It must be a *scoped* key with nothing but file-write permission.

---

## Deploying to petid.eth

1. `bun run deploy` — builds and pins `out/` to Pinata, prints the CIDv1 (`bafy…`).
2. Set the new CID as the `contenthash` of `petid.eth` (ENS manager → Records → contenthash → `ipfs://<cid>`).
3. Propagation is instant on `.link` / `.limo` once the tx confirms.

Pet profile pages are pinned individually at mint time and are **immutable** — redeploying the app never touches existing profiles.

---

## Gotchas (hard-won)

- **`writeContractAsync`, not `writeContract`.** The wizard runs async IPFS uploads between the click and the wallet popup; `writeContract` loses the user-gesture chain and the popup never appears.
- **Failed mint ≠ lost uploads.** The pipeline caches the photo/profile CIDs in state; "Retry transaction" resubmits only the tx. Any edit to the form invalidates the cache. `reset()` from `useWriteContract` must be called before retrying or the stale error instantly re-flags the UI.
- **CIDv1 only.** Pinata uploads must use `cidVersion: 1`; CIDv0 breaks ENS contenthash resolution. Contenthash = varint multicodec prefix + CID bytes (`lib/contenthash.ts`).
- **`.link`, not `.limo`, in QR codes** — that's what's printed on physical collars.
- **`tsconfig` targets ES2020** — wagmi/viem code uses bigint literals (`0n`); ES2017 fails the build.
- **`next: latest`** — the build floats with Next releases (16.x/Turbopack as of 2026-07). A cold build takes ~10 min on an M-series laptop; warm cache ~half.
- **Hardhat + some RPCs:** `deploy()` can throw inside `formatTransactionResponse` *after* broadcasting. Before re-sending, derive the CREATE address from the deployer nonce and check for code — the contract is probably already there.

---

## License

All rights reserved. Widget package (`widget/`) is MIT.
