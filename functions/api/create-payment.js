import { sha512, json } from './_lib.js';

export async function onRequestPost({ request, env }) {
  try {
    if (!env.ORDERS_DB || !env.EBOOKS) return json({ error: 'Order database ya ebook storage binding set nahi hai.' }, 500);
    if (!env.EASEBUZZ_KEY || !env.EASEBUZZ_SALT) return json({ error: 'Easebuzz credentials server par set nahi hain.' }, 500);

    const body = await request.json();
    const name = String(body.name || '').trim().slice(0, 60);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
    const phone = String(body.phone || '').replace(/\D/g, '');
    const bump = body.bump === true;
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || !/^\d{10}$/.test(phone)) {
      return json({ error: 'Naam, valid email aur 10 digit phone number bharein.' }, 400);
    }

    // Confirm private R2 objects exist before accepting an order.
    if (!(await env.EBOOKS.head('main-ebook.pdf'))) return json({ error: 'Main ebook storage mein nahi mili. Support se sampark karein.' }, 503);
    if (bump && !(await env.EBOOKS.head('recipe-ebook.pdf'))) return json({ error: 'Recipe ebook storage mein nahi mili. Support se sampark karein.' }, 503);

    const mainPrice = Number(env.PRICE_MAIN || 199);
    const bumpPrice = Number(env.PRICE_BUMP || 49);
    if (!Number.isFinite(mainPrice) || !Number.isFinite(bumpPrice) || mainPrice <= 0 || bumpPrice < 0) {
      return json({ error: 'Product pricing configuration galat hai.' }, 500);
    }
    const amount = (mainPrice + (bump ? bumpPrice : 0)).toFixed(2);
    const txnid = `DV${Date.now()}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const productinfo = bump ? 'Dog Care Ebook + Recipe Ebook' : 'Dog Care Ebook';
    const udf1 = bump ? 'bump' : 'main';
    const site = new URL(request.url).origin;
    const params = {
      key: env.EASEBUZZ_KEY, txnid, amount, productinfo, firstname: name, email, phone,
      udf1, udf2: '', udf3: '', udf4: '', udf5: '', udf6: '', udf7: '', udf8: '', udf9: '', udf10: '',
      surl: `${site}/#paid`, furl: `${site}/#checkout`,
    };
    const hashSequence = [params.key, txnid, amount, productinfo, name, email,
      udf1, '', '', '', '', '', '', '', '', '', env.EASEBUZZ_SALT].join('|');
    params.hash = await sha512(hashSequence);

    const isTest = String(env.EASEBUZZ_ENV || '').toLowerCase() === 'test';
    const base = isTest ? 'https://testpay.easebuzz.in' : 'https://pay.easebuzz.in';
    await env.ORDERS_DB.prepare(`INSERT INTO orders
      (txnid, customer_name, email, phone, bump, amount, currency, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'INR', 'initiated', ?)`)
      .bind(txnid, name, email, phone, bump ? 1 : 0, amount, Math.floor(Date.now() / 1000)).run();

    const response = await fetch(`${base}/payment/initiateLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const result = await response.json();
    if (!response.ok || Number(result.status) !== 1 || !result.data) {
  await env.ORDERS_DB.prepare("UPDATE orders SET status = 'initiation_failed' WHERE txnid = ? AND status = 'initiated'")
    .bind(txnid).run();

  const providerError = String(
    result.error_desc || result.message || result.error || `HTTP ${response.status}`
  ).slice(0, 300);

  console.error('Easebuzz initiation failed:', {
    httpStatus: response.status,
    status: result.status,
    error: providerError
  });

  return json({ error: `Easebuzz error: ${providerError}` }, 502);
}

    return json({ access_key: result.data, key: env.EASEBUZZ_KEY, txnid, env: isTest ? 'test' : 'prod' });
  } catch (error) {
    return json({ error: 'Payment start karte waqt server error aaya. Dobara try karein.' }, 500);
  }
}
