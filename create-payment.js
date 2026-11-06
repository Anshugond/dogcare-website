// Easebuzz access_key banata hai. KEY/SALT sirf server par (Cloudflare secrets).
import { sha512, json, saveRow } from './_lib.js';

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  try {
    const { name, email, phone, bump } = await request.json();
    if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || !/^\d{10}$/.test(phone || ''))
      return json({ error: 'Naam, email aur 10 digit phone sahi bharein.' }, 400);
    if (!env.EASEBUZZ_KEY || !env.EASEBUZZ_SALT) return json({ error: 'Server me Easebuzz key/salt set nahi hai.' }, 500);

    const MAIN = Number(env.PRICE_MAIN || 199), BUMP = Number(env.PRICE_BUMP || 49);
    const amount = (bump ? MAIN + BUMP : MAIN).toFixed(2);          // amount server par tay hota hai
    const txnid = 'DV' + Date.now() + crypto.randomUUID().replace(/-/g, '').slice(0, 6);
    const site = new URL(request.url).origin;
    const p = {
      key: env.EASEBUZZ_KEY, txnid, amount,
      productinfo: bump ? 'Dog Care Ebook + 60 Recipe Ebook' : 'Dog Care Ebook',
      firstname: name.slice(0, 60), email, phone,
      udf1: bump ? 'bump' : 'main', udf2: '', udf3: '', udf4: '', udf5: '',
      surl: site + '/#paid', furl: site + '/#checkout'
    };
    // key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
    p.hash = await sha512([p.key, p.txnid, p.amount, p.productinfo, p.firstname, p.email,
      p.udf1, p.udf2, p.udf3, p.udf4, p.udf5, '', '', '', '', '', env.EASEBUZZ_SALT].join('|'));

    const base = env.EASEBUZZ_ENV === 'test' ? 'https://testpay.easebuzz.in' : 'https://pay.easebuzz.in';
    const r = await fetch(base + '/payment/initiateLink', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(p).toString()
    });
    const d = await r.json();
    if (d.status !== 1) return json({ error: 'Easebuzz error: ' + (d.data || d.error_desc || 'unknown') }, 502);

    saveRow(env, ctx, { txnid, name, email, phone, bump: !!bump, amount, status: 'initiated' });
    return json({ access_key: d.data, key: env.EASEBUZZ_KEY, txnid });
  } catch (e) {
    return json({ error: 'Server error' }, 500);
  }
}
