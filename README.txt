CLOUDFLARE PAGES + EASEBUZZ + META PIXEL

Project root:
- index.html
- functions/api/create-payment.js
- functions/api/verify-payment.js
- functions/api/_lib.js

Deploy this project through Git integration (or Wrangler). Do not use dashboard drag-and-drop if you need Pages Functions.
Build command: leave blank
Build output directory: .

Pages > Settings > Variables and Secrets (set for Preview and Production as appropriate):
EASEBUZZ_KEY (Secret)
EASEBUZZ_SALT (Secret)
EASEBUZZ_ENV (test or live; must match browser CFG.env in index.html)
PRICE_MAIN (199)
PRICE_BUMP (49)
EBOOK_URL (download URL)
RECIPE_URL (download URL)

Meta Pixel ID installed once: 1141078851790581
Events:
- PageView: initial page load
- InitiateCheckout: actual click on any Buy Ebook link
- AddToCart: when the recipe bump checkbox is selected
- AddPaymentInfo: when the customer submits payment details to begin checkout
- Purchase: only after the server-side signed Easebuzz success response passes hash and amount checks

IMPORTANT:
1. In index.html CFG.env must be 'test' for sandbox, 'prod' for live.
2. EASEBUZZ_ENV must be 'test' for sandbox; for production use live (not test).
3. Do not expose Merchant Salt in browser code. Store it as a Cloudflare Secret.
4. Test the full flow with Meta Pixel Helper and Events Manager Test Events before running ads.
5. The browser Pixel Purchase event is emitted after server-side callback signature/amount verification. For stronger event reliability and deduplication, add Meta Conversions API with the same event_id; this package does not configure CAPI.
6. This package does not guarantee zero tracking loss: ad blockers, consent choices, browser restrictions, and network failures can prevent browser Pixel events.
