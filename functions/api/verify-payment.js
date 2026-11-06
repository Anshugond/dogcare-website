// Easebuzz response ka hash verify karke hi download links deta hai.
import { sha512, json, saveRow } from './_lib.js';

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  try {
    const r = await request.json();
    // salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
    const h = await sha512([env.EASEBUZZ_SALT, r.status, '', '', '', '', '', '', r.udf5 || '', r.udf4 || '',
      r.udf3 || '', r.udf2 || '', r.udf1 || '', r.email, r.firstname, r.productinfo, r.amount, r.txnid, env.EASEBUZZ_KEY].join('|'));
    const isBump = r.udf1 === 'bump';
    if ((!isBump && r.udf1 !== 'main') || r.status !== 'success' ||
        h.toLowerCase() !== String(r.hash || '').toLowerCase() || r.key !== env.EASEBUZZ_KEY) return json({ ok: false });
    const expectedAmount = (Number(env.PRICE_MAIN || 199) + (isBump ? Number(env.PRICE_BUMP || 49) : 0)).toFixed(2);
    if (!Number.isFinite(Number(r.amount)) || Number(r.amount).toFixed(2) !== expectedAmount) return json({ ok: false });

    saveRow(env, ctx, { txnid: r.txnid, name: r.firstname, email: r.email, phone: r.phone, bump: isBump, amount: r.amount, status: 'PAID' });
    const files = [{ title: 'Download Complete Dog Care Ebook', url: env.EBOOK_URL }];
    if (isBump) files.push({ title: 'Download 60 Recipe Ebook', url: env.RECIPE_URL });
    return json({
      ok: true,
      files: files.filter(f => f.url),
      purchase: { event_id: r.txnid, value: Number(r.amount), currency: 'INR',
        content_name: isBump ? 'Dog Care Ebook + 60 Recipe Ebook' : 'Dog Care Ebook',
        content_ids: isBump ? ['dog-care-ebook','recipe-ebook-60'] : ['dog-care-ebook'],
        num_items: isBump ? 2 : 1 }
    });
  } catch (e) {
    return json({ ok: false });
  }
}
