export async function sha512(str) {
  const b = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(str));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export const json = (b, c = 200) =>
  new Response(JSON.stringify(b), { status: c, headers: { 'Content-Type': 'application/json' } });

// Customer details ek jagah (Google Sheet webhook). Optional: SHEET_WEBHOOK env var.
export function saveRow(env, ctx, row) {
  if (!env.SHEET_WEBHOOK) return;
  ctx.waitUntil(fetch(env.SHEET_WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ time: new Date().toISOString(), ...row })
  }).catch(() => {}));
}
