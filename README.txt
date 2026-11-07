DOGCARE WEBSITE — CLOUDFLARE PAGES + EASEBUZZ + PRIVATE R2 + D1 + META PIXEL

PROJECT FILES
- index.html
- functions/api/create-payment.js
- functions/api/verify-payment.js
- functions/api/download.js
- functions/api/_lib.js
- migrations/0001_orders.sql

CLOUDFLARE PAGES SETTINGS
- Framework preset: None
- Build command: leave blank
- Build output directory: .
- Production branch: main

REQUIRED PAGES VARIABLES / SECRETS
- EASEBUZZ_KEY: Text or Secret (merchant key)
- EASEBUZZ_SALT: Secret only
- EASEBUZZ_ENV: test OR live (use the matching Easebuzz credentials)
- PRICE_MAIN: 199
- PRICE_BUMP: 49

REQUIRED BINDINGS (Production and Preview as applicable)
- R2 bucket binding variable name: EBOOKS; bucket: dogcare-ebooks
- D1 database binding variable name: ORDERS_DB; database: dogcare-orders

R2 OBJECTS (bucket must remain private; do not enable public access)
- main-ebook.pdf
- recipe-ebook.pdf
The file object names must match exactly. This code does not use EBOOK_URL or RECIPE_URL public links.

D1 DATABASE INITIALIZATION — REQUIRED ONCE
1. Open Storage & databases > D1 SQL Database > dogcare-orders.
2. Open Console.
3. Paste the complete contents of migrations/0001_orders.sql and execute it.
4. Confirm tables `orders` and `download_tokens` exist.

EASEBUZZ ENVIRONMENT WARNING
- EASEBUZZ_ENV=test routes to https://testpay.easebuzz.in and requires TEST/SANDBOX merchant credentials.
- EASEBUZZ_ENV=live (any value other than test) routes to https://pay.easebuzz.in and requires LIVE merchant credentials.
- Do not mix live credentials with test environment, or test credentials with live environment.
- The frontend uses the environment returned by the server; do not manually expose the salt or keys in index.html.
- Before production advertising, complete an end-to-end payment and refund/reconciliation test with Easebuzz. If you only have live credentials, do not switch to live until you are ready to perform a controlled live transaction.

PAYMENT / DELIVERY FLOW
1. Server calculates amount from PRICE_MAIN and PRICE_BUMP; client amount is ignored.
2. Server creates an initiated order in D1 and requests an Easebuzz access key.
3. Browser receives the Easebuzz hosted checkout popup.
4. After callback, server validates the callback SHA-512 hash and compares it to the saved D1 order.
5. Server independently calls Easebuzz Transaction V2 Retrieve API and checks txnid, success status, and amount.
6. Only a confirmed paid order receives short-lived R2 download tokens.
7. Download links expire after 24 hours and allow up to 5 downloads per file. Files are streamed from the private R2 bucket; no public object URL is exposed.

META PIXEL
Pixel ID already in index.html: 1141078851790581
- PageView on page load
- InitiateCheckout on Buy Ebook CTA click
- AddToCart when recipe bump is selected
- AddPaymentInfo when Easebuzz checkout is launched
- Purchase only after server-side verification succeeds
Browser events can still be blocked by ad blockers, browser privacy settings, or network failure. This package does not set up Meta Conversions API.

DEPLOYMENT CHECKLIST
1. Run migrations/0001_orders.sql in D1 Console.
2. Confirm the two Pages bindings exactly match the names above.
3. Add/confirm variables and secrets for Production.
4. Commit and push all project files to GitHub main branch (keep `functions` and `migrations` at repository root).
5. Wait for Cloudflare Pages deployment to finish.
6. Test with Easebuzz sandbox credentials and EASEBUZZ_ENV=test first.
7. Only after successful testing, configure the live credentials and EASEBUZZ_ENV=live, then run a controlled live transaction.

SECURITY NOTES
- Never share EASEBUZZ_SALT in screenshots or chat.
- Keep R2 Public Access disabled and do not enable the Public Development URL.
- Do not publish the PDF direct object URLs.
- This project does not automatically email the ebook; the successful checkout page shows secure download links.


REUSABLE LANDING PAGE BUILDER (NEW)
- Admin UI: https://YOUR-DOMAIN/admin.html (or /admin)
- Admin API: /api/admin/*
- Public product pages: /your-page-slug
- Existing homepage `/` remains unchanged.
- New files: admin.html, functions/admin.js, functions/[slug].js,
  functions/api/admin/[[path]].js, functions/api/media.js,
  migrations/0002_landing_builder.sql.

ADDITIONAL CLOUDFLARE SECRETS
- ADMIN_PASSWORD: strong unique password for the builder login.
- ADMIN_SECRET: separate random secret (at least 32 random characters) used to sign the HttpOnly admin session cookie.
Do not reuse Easebuzz credentials for admin authentication.

ONE-TIME DATABASE UPDATE
Run migrations/0002_landing_builder.sql in the existing `dogcare-orders` D1 Console AFTER the existing 0001 migration is already installed. This migration adds landing_pages and page-specific product metadata to orders. Run it only once.

HOW TO USE
1. Deploy the updated project to Cloudflare Pages.
2. Add ADMIN_PASSWORD and ADMIN_SECRET as Production secrets, then redeploy.
3. Run migration 0002 once in D1.
4. Open /admin.html and log in.
5. Create a page, set product title/price, upload main and optional bump PDFs, customize hero and sections, save draft or publish.
6. The page is available at /your-slug. The checkout uses the shared create-payment and verify-payment APIs. PDF objects remain private in R2; downloads use expiring D1 tokens.
7. Hero images uploaded through the editor are stored in R2 under images/ and served through /api/media.

IMPORTANT
- Uploads use the existing private EBOOKS R2 binding.
- This first builder version offers a live preview plus editable sections and section reordering controls. It is not a free-form pixel-perfect drag-and-drop canvas.
- Do not test a live payment until the current Easebuzz retrieve/verification issue has been confirmed fixed using sandbox first.
- The GitHub ZIP does not include the current Git commit SHA, so verify its commit against the repository's latest main commit before treating it as definitively current.


META CONVERSIONS API (SERVER-SIDE PURCHASE)
-------------------------------------------
The payment verification endpoint sends a server-side Purchase event after
Easebuzz independently confirms the transaction and the order is marked paid.

Set these Cloudflare Pages secrets/variables:
- META_CAPI_ACCESS_TOKEN = Conversions API access token for the same Meta dataset/pixel.
- META_PIXEL_ID = Meta Pixel/Dataset ID (optional if the landing page has pixelId).
- META_GRAPH_API_VERSION = optional Graph API version; defaults to v25.0.
- META_TEST_EVENT_CODE = optional; set only while testing in Events Manager, then remove.

Run migrations/0003_meta_capi.sql against the production D1 database.
Browser Pixel and server CAPI Purchase share txnid as event ID for deduplication.
CAPI errors are logged and do not interrupt payment confirmation or ebook delivery.


META CAPI - PAGEVIEW AND INITIATECHECKOUT
-----------------------------------------
Added server-side PageView and InitiateCheckout events via /api/track-event.
The root Dog Care page and dynamic published landing pages send matching browser
and server event IDs for Meta deduplication. Purchase CAPI remains unchanged.

Before deploying this update, run migrations/0004_meta_standard_events.sql
against the production D1 database. Existing Cloudflare secrets are reused:
META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, and optional META_TEST_EVENT_CODE.
Server events are subject to applicable consent, privacy choices, browser/network
restrictions, and Meta matching/attribution limitations. Browser Pixel cannot be
forced to run when a visitor's blocker prevents it.
