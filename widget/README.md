# @petidentity/widget

Embeddable [PetID](https://petid.eth.link) widget for pet shops, vets and groomers.

Your customers mint an ENS identity for their pet (`max.dogid.eth` / `luna.catid.eth`) with a permanent IPFS profile page and a QR collar tag — at **your price**, set in dollars. You keep everything above the wholesale price, settled on-chain by the `PetIDRegistrarV4` contract. No invoices, no revenue share paperwork; withdraw your earnings anytime.

## 1. Become a partner

Reseller access is **approved per wallet**, so there are two steps:

1. Open [petid.eth.link/partner](https://petid.eth.link/partner/), connect the wallet that should receive earnings, and send us the request shown there.
2. Once approved, come back and set your business name and customer price. You're live.

Prices are held in **US dollars**, so your margin doesn't drift when the ETH rate moves. Set your price to `0` at any time to pause your listing.

## 2. Add the widget to your site

### Script tag (easiest)

```html
<script src="https://unpkg.com/@petidentity/widget" data-partner="0xYOUR_WALLET"></script>
```

Renders a "Create your pet's PetID" button where the script tag is placed. Options:

| attribute | default | notes |
|---|---|---|
| `data-partner` | — | **required**, your partner wallet |
| `data-label` | `Create your pet's PetID` | button text |
| `data-theme` | `light` | `light` or `dark` |
| `data-mode` | `button` | `inline` renders the full registration flow in an iframe |
| `data-target` | script location | CSS selector to mount into |

### JavaScript API

```html
<script src="https://unpkg.com/@petidentity/widget"></script>
<script>
  PetIDWidget.mount(document.getElementById("petid"), {
    partner: "0xYOUR_WALLET",
    mode: "inline", // or "button"
  });
</script>
```

### No JavaScript at all

Link anywhere: `https://petid.eth.link/register/?partner=0xYOUR_WALLET`

## How the money flows

1. Customer pays your price in one transaction, in **ETH or USDC**. The dollar price is converted at the live rate, and any excess ETH is refunded in the same transaction.
2. The registrar mints the ENS subname straight to the customer's wallet with the IPFS profile attached.
3. Your margin — everything above wholesale — accrues to your address inside the registrar contract. Withdraw anytime from the [partner dashboard](https://petid.eth.link/partner/); only your wallet can claim it.

Attribution is on-chain and unfakeable: the registration transaction itself carries your partner address.

## License

MIT
