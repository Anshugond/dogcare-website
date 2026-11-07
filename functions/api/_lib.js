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


// Meta Conversions API helpers. Customer identifiers are normalized and SHA-256 hashed.
export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sendMetaPurchase({ pixelId, accessToken, order, request, eventTime, testEventCode, apiVersion }) {
  if (!pixelId || !accessToken) return { skipped: true, reason: 'Meta CAPI credentials not configured' };

  const email = String(order.email || '').trim().toLowerCase();
  let phone = String(order.phone || '').replace(/\D/g, '');
  if (phone.length === 10) phone = `91${phone}`;
  const userData = {
    em: email ? [await sha256(email)] : undefined,
    ph: phone ? [await sha256(phone)] : undefined,
    client_ip_address: order.client_ip_address || request.headers.get('CF-Connecting-IP') || undefined,
    client_user_agent: order.client_user_agent || request.headers.get('User-Agent') || undefined,
    fbp: order.meta_fbp || undefined,
    fbc: order.meta_fbc || undefined,
  };
  for (const key of Object.keys(userData)) {
    if (userData[key] === undefined || userData[key] === '') delete userData[key];
  }

  const origin = new URL(request.url).origin;
  const slug = String(order.page_slug || '').trim();
  const eventSourceUrl = slug ? `${origin}/${encodeURIComponent(slug)}` : `${origin}/`;
  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: Number(eventTime) || Math.floor(Date.now() / 1000),
      event_id: String(order.txnid),
      action_source: 'website',
      event_source_url: eventSourceUrl,
      user_data: userData,
      custom_data: {
        currency: String(order.currency || 'INR'),
        value: Number(order.amount),
        order_id: String(order.txnid),
        content_type: 'product',
        content_name: order.bump
          ? `${order.product_name || 'Product'} + ${order.bump_product_name || 'Bonus'}`
          : (order.product_name || 'Product'),
        content_ids: order.bump
          ? [order.page_slug || 'main-product', `${order.page_slug || 'main-product'}-bump`]
          : [order.page_slug || 'main-product'],
        num_items: order.bump ? 2 : 1,
      },
    }],
    ...(testEventCode ? { test_event_code: String(testEventCode) } : {}),
  };
  const version = String(apiVersion || 'v25.0').replace(/^v?/, 'v');
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, access_token: accessToken }),
  });
  const responseText = await response.text();
  let result;
  try { result = JSON.parse(responseText); } catch { result = { raw: responseText.slice(0, 500) }; }
  if (!response.ok || result.error || Number(result.events_received || 0) < 1) {
    throw new Error(`Meta CAPI rejected Purchase event: HTTP ${response.status} ${JSON.stringify(result).slice(0, 500)}`);
  }
  return result;
}
