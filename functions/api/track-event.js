import { json, sendMetaStandardEvent } from './_lib.js';

export async function onRequestPost({ request, env }) {
  try {
    if (!env.ORDERS_DB) return json({ ok: false, error: 'Database unavailable' }, 503);
    const body = await request.json();
    const eventName = String(body.event_name || '');
    const eventId = String(body.event_id || '');
    const pageSlug = String(body.page_slug || '').trim().toLowerCase();

    if (!['PageView', 'InitiateCheckout'].includes(eventName) ||
        !/^[A-Za-z0-9_.:-]{8,100}$/.test(eventId) ||
        (pageSlug && !/^[a-z0-9-]{1,70}$/.test(pageSlug))) {
      return json({ ok: false, error: 'Invalid event data' }, 400);
    }

    // PageView uses the site Pixel ID; published landing pages may override it.
    let pixelId = String(env.META_PIXEL_ID || '').trim();
    if (pageSlug) {
      const page = await env.ORDERS_DB.prepare(
        "SELECT config_json FROM landing_pages WHERE slug = ? AND status = 'published'"
      ).bind(pageSlug).first();
      if (page?.config_json) {
        try {
          const config = JSON.parse(page.config_json);
          pixelId = String(config.pixelId || pixelId).trim();
        } catch {}
      }
    }
    const accessToken = String(env.META_CAPI_ACCESS_TOKEN || '').trim();
    if (!pixelId || !accessToken) return json({ ok: false, error: 'Meta CAPI is not configured' }, 503);

    // Keep a short-lived idempotency record to prevent duplicate retries.
    await env.ORDERS_DB.prepare(
      "DELETE FROM meta_capi_events WHERE created_at < ?"
    ).bind(Math.floor(Date.now() / 1000) - 30 * 86400).run();

    const now = Math.floor(Date.now() / 1000);
    const insert = await env.ORDERS_DB.prepare(`
      INSERT OR IGNORE INTO meta_capi_events (event_id, event_name, status, created_at)
      VALUES (?, ?, 'sending', ?)
    `).bind(eventId, eventName, now).run();

    if (Number(insert.meta?.changes || 0) === 0) {
      return json({ ok: true, duplicate: true });
    }

    try {
      const result = await sendMetaStandardEvent({
        pixelId, accessToken, eventName, eventId, request, pageSlug,
        eventTime: now,
        testEventCode: env.META_TEST_EVENT_CODE || '',
      });
      await env.ORDERS_DB.prepare(
        "UPDATE meta_capi_events SET status = 'sent' WHERE event_id = ? AND event_name = ?"
      ).bind(eventId, eventName).run();
      return json({ ok: true, events_received: result.events_received || 1 });
    } catch (error) {
      await env.ORDERS_DB.prepare(
        "DELETE FROM meta_capi_events WHERE event_id = ? AND event_name = ?"
      ).bind(eventId, eventName).run();
      console.error(`META_CAPI_${eventName.toUpperCase()}_FAILED:`, error?.message || error);
      return json({ ok: false, error: 'Meta event could not be sent' }, 502);
    }
  } catch (error) {
    console.error('META_CAPI_TRACK_EVENT_EXCEPTION:', error?.message || error);
    return json({ ok: false, error: 'Event tracking unavailable' }, 500);
  }
}
