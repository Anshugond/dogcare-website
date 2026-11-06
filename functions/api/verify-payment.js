import { sha512, json, timingSafeEqual, amountString, callbackHashFields, findTransactionRecord, makeToken } from './_lib.js';

export async function onRequestPost({ request, env }) {
  try {
    if (!env.ORDERS_DB || !env.EBOOKS || !env.EASEBUZZ_KEY || !env.EASEBUZZ_SALT) {
      return json({ ok: false, error: 'Payment verification configuration incomplete hai.' }, 500);
    }
    const r = await request.json();
    const txnid = String(r.txnid || '');
    if (!/^DV\d{13,}[a-f0-9]{6,}$/i.test(txnid) || r.key !== env.EASEBUZZ_KEY || String(r.status || '').toLowerCase() !== 'success') {
      return json({ ok: false, error: 'Payment response valid nahi hai.' }, 400);
    }

    const order = await env.ORDERS_DB.prepare('SELECT * FROM orders WHERE txnid = ?').bind(txnid).first();
    if (!order) return json({ ok: false, error: 'Order record nahi mila.' }, 404);
    if (order.status !== 'initiated' && order.status !== 'paid') {
      return json({ ok: false, error: 'Order paid status mein nahi hai.' }, 409);
    }

    const callbackHash = await sha512([env.EASEBUZZ_SALT, ...callbackHashFields(r)].join('|'));
    if (!timingSafeEqual(callbackHash.toLowerCase(), String(r.hash || '').toLowerCase())) {
      return json({ ok: false, error: 'Payment signature verify nahi hua.' }, 400);
    }
    const expectedAmount = amountString(order.amount);
    if (amountString(r.amount) !== expectedAmount || String(r.email || '').toLowerCase() !== String(order.email).toLowerCase() ||
        (r.udf1 === 'bump') !== Boolean(order.bump)) {
      return json({ ok: false, error: 'Payment details order se match nahi karte.' }, 400);
    }

    // Verify the transaction independently with Easebuzz; never rely only on browser callback data.
    const isTest = String(env.EASEBUZZ_ENV || '').toLowerCase() === 'test';
    const base = isTest ? 'https://testpay.easebuzz.in' : 'https://pay.easebuzz.in';
    const retrieveHash = await sha512(`${env.EASEBUZZ_KEY}|${txnid}|${env.EASEBUZZ_SALT}`);
    const retrieveResponse = await fetch(`${base}/transaction/v2/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: env.EASEBUZZ_KEY, txnid, hash: retrieveHash }),
    });
    if (!retrieveResponse.ok) return json({ ok: false, error: 'Easebuzz se transaction status verify nahi ho paya. Support se sampark karein.' }, 502);
    const retrievePayload = await retrieveResponse.json();
    const transaction = findTransactionRecord(retrievePayload, txnid);
    const txnStatus = String(transaction?.status || transaction?.txn_status || transaction?.transaction_status || '').toLowerCase();
    if (!transaction || txnStatus !== 'success' || amountString(transaction.amount) !== expectedAmount) {
      return json({ ok: false, error: 'Easebuzz transaction status ya amount confirm nahi hua.' }, 409);
    }

    const now = Math.floor(Date.now() / 1000);
    const expires = now + 24 * 60 * 60;
    const products = [{ objectKey: 'main-ebook.pdf', filename: 'main-ebook.pdf' }];
    if (order.bump) products.push({ objectKey: 'recipe-ebook.pdf', filename: 'recipe-ebook.pdf' });
    const insertStatements = products.map((product) => env.ORDERS_DB.prepare(`
      INSERT OR IGNORE INTO download_tokens (token, txnid, object_key, filename, expires_at, max_downloads, downloads)
      SELECT ?, ?, ?, ?, ?, 5, 0 WHERE EXISTS (SELECT 1 FROM orders WHERE txnid = ? AND status = 'paid')
    `).bind(makeToken(), txnid, product.objectKey, product.filename, expires, txnid));

    await env.ORDERS_DB.batch([
      env.ORDERS_DB.prepare(`UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?)
        WHERE txnid = ? AND status IN ('initiated', 'paid')`).bind(now, txnid),
      ...insertStatements,
    ]);

    const finalOrder = await env.ORDERS_DB.prepare('SELECT status FROM orders WHERE txnid = ?').bind(txnid).first();
    if (finalOrder?.status !== 'paid') return json({ ok: false, error: 'Order paid mark nahi ho paya.' }, 409);
    const tokenRows = await env.ORDERS_DB.prepare('SELECT object_key, filename, token FROM download_tokens WHERE txnid = ? ORDER BY object_key').bind(txnid).all();
    const rows = tokenRows.results || [];
    if (rows.length !== products.length) return json({ ok: false, error: 'Download permission generate nahi ho payi. Support se sampark karein.' }, 500);

    const files = rows.map((row) => ({
      title: row.object_key === 'recipe-ebook.pdf' ? 'Download Recipe Ebook' : 'Download Complete Dog Care Ebook',
      url: `/api/download?token=${encodeURIComponent(row.token)}`,
    }));
    return json({
      ok: true,
      files,
      purchase: {
        event_id: txnid, value: Number(order.amount), currency: 'INR',
        content_name: order.bump ? 'Dog Care Ebook + Recipe Ebook' : 'Dog Care Ebook',
        content_ids: order.bump ? ['dog-care-ebook', 'recipe-ebook'] : ['dog-care-ebook'],
        num_items: order.bump ? 2 : 1,
      },
    });
 } catch (error) {
  return json({
    ok: false,
    error: 'VERIFY_PAYMENT_EXCEPTION',
    debug: String(error?.message || error).slice(0, 300),
  }, 500);
}
}
