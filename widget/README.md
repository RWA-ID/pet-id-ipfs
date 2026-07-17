# @petidentity/widget

Embeddable [PetID](https://petid.eth.link) widget for pet shops, vets and groomers.

Your customers mint an ENS identity for their pet (`max.dogid.eth` / `luna.catid.eth`) with a permanent IPFS profile page and a QR collar tag — at **your price**. You keep everything above the protocol fee, settled on-chain by the `PetIDPartnerRouter` contract. No invoices, no revenue share paperwork; withdraw your earnings anytime.

## 1. Become a partner (one transaction)

Open [petid.eth.link/partner](https://petid.eth.link/partner/), connect the wallet that should receive earnings, set your business name and price. That's it — you're live.

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

1. Customer pays your price in ETH in one transaction.
2. The router forwards the protocol fee to the PetID registrar, which mints the ENS subname straight to the customer's wallet with the IPFS profile attached.
3. Your margin accrues in the router contract — withdraw anytime from the [partner dashboard](https://petid.eth.link/partner/).

Attribution is on-chain and unfakeable: the registration transaction itself carries your partner address.

## License

MIT
