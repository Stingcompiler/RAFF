# Raff — Developer handoff

Targets: Next.js + Tailwind v4 + Lucide. Locales `ar` (RTL) / `en` (LTR); themes `light` / `dark`. Use logical CSS (`ps-*`, `pe-*`, `text-start`, `border-s`), never left/right.

## Tokens (section 3 names, exact values in `Raff Tokens.dc.html`)
`bg surface surface-raised sidebar ink muted line primary primary-ink accent success success-bg warn warn-bg danger danger-bg info info-bg focus`
Expose as CSS variables on `[data-theme]`, map in Tailwind v4 `@theme` (`--color-bg: var(--bg)` …).
Deviation: light `muted` is `#5F6D63` (brief `#6F7D73` fails 4.5:1).
Type: IBM Plex Sans Arabic / IBM Plex Sans, 400/500/600/700. Screen title 26–28/500, panel 16/500, body 14/400, labels 12/500, money 28–32/500 tabular. Min functional text 12px.
Spacing 4/8/12/16/24/32/48; radius 8–12; shadow on dialogs only; focus ring 3px `focus`.

## Components (names per section 6, demos in `Raff Components.dc.html`)
Button(primary|outline|quiet|danger; default|hover|focus|disabled|loading), IconButton(label required), Input/Select/Textarea, SearchField(+KeyboardHint), Badge, StatusDot, Table, Tabs, Segmented, Panel, Dialog(confirm|form|choice; focus trap), Toast, EmptyState, Skeleton, StatTile, KeyboardHint, ConnectionIndicator, BranchSwitcher, ThemeToggle, LocaleToggle (in user menu), ReceiptPreview(80mm, always light).

## Rules
- State = icon/symbol + text, never color alone (● ▲ ✕ ■).
- Western digits; barcodes/batches/prices `dir="ltr"` isolated (`unicode-bidi: isolate`). Currency `ج.س` after (ar), `SDG` before (en). Dates `YYYY-MM-DD`.
- No success before server reply; approve buttons disabled while pending.
- Motion: 120–400ms, `cubic-bezier(.2,.8,.2,1)`; honor `prefers-reduced-motion`.
- Sidebar 232px → 64px ≤1180px → drawer ≤760px. Rows 44px desktop / 48px mobile; touch targets ≥44px.

## Files
POS `Raff POS.dc.html` · screens 7.2–7.12 `Raff Screens.dc.html` · mobile `Raff Mobile.dc.html` · landing `Raff Landing.dc.html` · components+receipt `Raff Components.dc.html` · flows `Raff Flows.dc.html` · tokens `Raff Tokens.dc.html`. All data is sample data.

## Design-review decisions (21 Oct 2026)
- POS keyboard rule: typed text fills the search field and filters the list. Exact barcode match → add immediately and clear. Otherwise Enter adds the selected row. `5*` then Enter sets quantity 5. Bind to the real search input; disable inside dialogs.
- Payment dialog has four forms (cash, bank with reference + "awaiting verification", credit with customer search/balance/limit, split with remainder). Approve → `approving` (button disabled) → `approved` (receipt, print, reprint, New sale = Enter). No success state before the server reply.
- Cart line: remove (✕), per-line discount, quantity stepper, unit conversion hint. Stock column always shows its unit ("210 Strip").
- Held sales: F4 holds, F6 lists/resumes. Added states: server reconnecting, update-ready chip, Rx badge slot on rows and cart lines.
- Selected rows use `ink` for secondary text (muted on accent fails 4.5:1).
- Pharmacy Landing is an extra deliverable (not in the brief); it uses placeholder phone/WhatsApp numbers, set them via props.
- Fonts: the mockups load Google Fonts; self-host IBM Plex Sans / Sans Arabic in the app.

## Storefront module (public site + admin)
Files: public `Storefront.dc.html` · admin `Raff Screens.dc.html` (screens `orders`, `storeCat`, `storeSet`; embedded part `Raff Screens Orders.dc.html`) · POS "from order" state in `Raff POS.dc.html` (prop `fromOrder`) · item drawer tab "Storefront" in `Raff Screens.dc.html`.
Routes: `/` `/store` `/categories/[slug]` `/products/[slug]` `/cart` `/checkout` `/orders/[token]` `/orders/track`; admin: Orders, Order detail, Published catalog, Store settings.
New tokens: `brand` (default = `primary`), `brand-ink`. Only logo, name, brand colour and hero image are customisable.
New components: ProductCard, AvailabilityBadge (3 values only), RxNotice, PriceWithDate, PickupSelector, OrderStatusStepper (customer / staff variants), OrderTimeline, PublishToggle (disabled until image, description, price, class complete), WhatsAppAction (wa.me template + copy), StorefrontStatusChip.
Order states: new → needs contact | confirmed | cancelled; confirmed → preparing → ready → completed (automatic on invoice approval). Superseded by Round 4 below.
Binding rules: no stock numbers publicly; Rx has no price and no cart; every price has its date; totals say "estimated"; no word "reserve" before confirmation; no health data in free fields; real photos only (placeholder: icon + "no image"); submit must show sending / failed (data kept) / verifying (stable id) / success.
Placeholders to replace before launch: pharmacy name, logo, brand colour, hero/store photos, address, hours, WhatsApp, services, About text, first 100–300 published items with photos.

## Round 4 (22 Oct 2026)

### Rules
- Every date sits in its own `dir="ltr"` element with `unicode-bidi: isolate`, formatted `YYYY-MM-DD` (time `HH:MM` follows inside the same isolate).
- Shortage rule: confirming an order with any line whose available quantity is below the requested quantity is refused; the order moves to `needs_contact` automatically with the reason recorded.
- Substitution rule: editing a line's quantity or substituting it requires the customer-consent field; the edit is sent on WhatsApp before confirmation is allowed.
- Rx item card (public): only RxNotice ("Prescription required — pharmacist review") and the "Request pharmacist review" button. No availability badge, no price line.

### Order states
| State | Allowed buttons | Moved by | Reservation |
|---|---|---|---|
| `new` | Needs contact · Confirm · Cancel | Staff | None |
| `needs_contact` | Confirm · Cancel | Staff (or system via shortage rule) | None |
| `confirmed` | Preparing · Cancel | Staff (confirm dialog) | Created, held until a set time |
| `preparing` | Ready · Cancel | Staff | Held |
| `ready` | Convert to invoice in POS · Cancel | Staff | Held |
| `completed` | none | System, on POS invoice approval (`OrderInvoiceLink`) | Consumed |
| `cancelled` | none | Staff, from any state before `completed`, reason required | Released |

`completed` shows "Linked to invoice INV-…" and the approval date. No manual transition to `completed`. Backend: `orders/{id}/to-sale/` accepted in `ready` only; `completed` is set inside `post_sale` when an `OrderInvoiceLink` exists.

### Final package
- `Raff POS.dc.html` — POS sale, payment, approved receipt, "from order" state.
- `Raff Screens.dc.html` — workspace shell and screens 7.2–7.12, incl. Orders, Order detail, Published catalog, Storefront settings. **The reference for order details is `Raff Screens` only.**
- `Raff Screens Orders.dc.html` — embedded part rendered inside `Raff Screens` (no shell). Not a reference; do not open standalone.
- `Raff Mobile.dc.html` — mobile screens, incl. staff Orders.
- `Storefront.dc.html` — public storefront (ar/en).
- `Raff Landing.dc.html` — Raff product landing.
- `Pharmacy Landing.dc.html` — extra pharmacy landing (placeholder numbers).
- `Raff Components.dc.html` — components and receipt.
- `Raff Flows.dc.html` — flows.
- `Raff Tokens.dc.html` — tokens.
- `Raff Board.dc.html` — review board of states.
- `HANDOFF.md` — this file.
- `Storefront Admin.dc.html` — removed.

## Proposals
None.
