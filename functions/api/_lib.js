export async function sha512(value) {
  const digest = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function amountString(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '';
}

export function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function callbackHashFields(r) {
  // Easebuzz reverse hash: salt|status|udf10...udf1|email|firstname|productinfo|amount|txnid|key
  const udf = [];
  for (let i = 10; i >= 1; i--) udf.push(r[`udf${i}`] || '');
  return [r.status || '', ...udf, r.email || '', r.firstname || '', r.productinfo || '',
    r.amount || '', r.txnid || '', r.key || ''];
}

export function findTransactionRecord(payload, txnid) {
  const seen = new Set();
  const stack = [payload];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    if (!Array.isArray(item) && String(item.txnid || '') === String(txnid)) return item;
    if (Array.isArray(item)) stack.push(...item);
    else stack.push(...Object.values(item));
  }
  return null;
}
