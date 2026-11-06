import { json } from './_lib.js';

export async function onRequestGet({ request, env }) {
  try {
    if (!env.ORDERS_DB || !env.EBOOKS) return json({ error: 'Download service configuration incomplete hai.' }, 500);
    const token = new URL(request.url).searchParams.get('token') || '';
    if (!/^[a-f0-9]{64}$/.test(token)) return new Response('Invalid download link.', { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    const result = await env.ORDERS_DB.prepare(`
      UPDATE download_tokens SET downloads = downloads + 1
      WHERE token = ? AND expires_at > ? AND downloads < max_downloads
      RETURNING object_key, filename
    `).bind(token, now).first();
    if (!result) return new Response('Download link expire ho gaya hai ya download limit complete hai.', { status: 410 });

    const object = await env.EBOOKS.get(result.object_key);
    if (!object) return new Response('File abhi available nahi hai. Support se sampark karein.', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `attachment; filename="${result.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
    headers.set('Cache-Control', 'private, no-store, max-age=0');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Length', String(object.size));
    return new Response(object.body, { headers });
  } catch (error) {
    return new Response('Download temporarily unavailable. Please try again.', { status: 503 });
  }
}
