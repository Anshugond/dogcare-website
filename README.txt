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
