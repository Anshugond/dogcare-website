
import { sha512, json } from './_lib.js';

export async function onRequestPost({ request, env }) {
  let txnid = null;

  try {
    // Check required Cloudflare bindings and secrets
    if (!env.ORDERS_DB || !env.EBOOKS) {
      return json({
        error: 'Payment service temporarily unavailable.'
      }, 500);
    }

    if (!env.EASEBUZZ_KEY || !env.EASEBUZZ_SALT) {
      console.error('EASEBUZZ_CREDENTIALS_MISSING');

      return json({
        error: 'Payment service temporarily unavailable.'
      }, 500);
    }

    const body = await request.json();

    const pageSlug = String(body.pageSlug || '')
      .trim()
      .toLowerCase();

    let page = null;
    let pageConfig = {};

    // Load published landing page configuration
    if (pageSlug) {
      page = await env.ORDERS_DB
        .prepare("SELECT * FROM landing_pages WHERE slug = ? AND status = 'published'")
        .bind(pageSlug)
        .first();

      if (!page) {
        return json({
          error: 'Landing page nahi mili ya publish nahi hai.'
        }, 404);
      }

      try {
        pageConfig = JSON.parse(page.config_json || '{}');
      } catch (error) {
        console.error('INVALID_PAGE_CONFIG:', error?.message);

        return json({
          error: 'Product configuration invalid hai.'
        }, 500);
      }
    }

    // Validate customer details
    const name = String(body.name || '')
      .trim()
      .slice(0, 60);

    const email = String(body.email || '')
      .trim()
      .toLowerCase()
      .slice(0, 120);

    const phone = String(body.phone || '')
      .replace(/\D/g, '');

    const bump = body.bump === true;

    if (
      name.length < 2 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      !/^\d{10}$/.test(phone)
    ) {
      return json({
        error: 'Naam, valid email aur 10 digit phone number bharein.'
      }, 400);
    }

    // Check private ebook files in R2
    const mainObjectKey = String(
      pageConfig.mainObjectKey || 'main-ebook.pdf'
    );

    const bumpObjectKey = String(
      pageConfig.bumpObjectKey || 'recipe-ebook.pdf'
    );

    if (!(await env.EBOOKS.head(mainObjectKey))) {
      return json({
        error: 'Main product file storage mein nahi mili.'
      }, 503);
    }

    if (bump && !(await env.EBOOKS.head(bumpObjectKey))) {
      return json({
        error: 'Order bump file storage mein nahi mili.'
      }, 503);
    }

    if (bump && pageConfig.bumpEnabled === false) {
      return json({
        error: 'Is product ke liye add-on available nahi hai.'
      }, 400);
    }

    // Calculate server-side price
    const mainPrice = page
      ? Number(pageConfig.price ?? 149)
      : Number(env.PRICE_MAIN || 199);

    const bumpPrice = page
      ? Number(pageConfig.bumpPrice ?? 49)
      : Number(env.PRICE_BUMP || 49);

    if (
      !Number.isFinite(mainPrice) ||
      !Number.isFinite(bumpPrice) ||
      mainPrice <= 0 ||
      bumpPrice < 0
    ) {
      console.error('INVALID_PRODUCT_PRICING');

      return json({
        error: 'Product pricing configuration galat hai.'
      }, 500);
    }

    const amount = (
      mainPrice + (bump ? bumpPrice : 0)
    ).toFixed(2);

    txnid = `DV${Date.now()}${crypto.randomUUID()
      .replace(/-/g, '')
      .slice(0, 12)}`;

    const productName = String(
      pageConfig.productName || page?.title || 'Dog Care Ebook'
    ).slice(0, 80);

    const bumpProductName = String(
      pageConfig.bumpTitle || 'Bonus Ebook'
    ).slice(0, 80);

    const productinfo = (
      bump
        ? `${productName} and ${bumpProductName}`
        : productName
    ).slice(0, 100);

    const udf1 = bump ? 'bump' : 'main';
    const site = new URL(request.url).origin;

    // Easebuzz payment parameters
    const params = {
      key: env.EASEBUZZ_KEY,
      txnid,
      amount,
      productinfo,
      firstname: name,
      email,
      phone,
      udf1,
      udf2: '',
      udf3: '',
      udf4: '',
      udf5: '',
      udf6: '',
      udf7: '',
      udf8: '',
      udf9: '',
      udf10: '',
      surl: pageSlug
        ? `${site}/${pageSlug}#paid`
        : `${site}/#paid`,
      furl: pageSlug
        ? `${site}/${pageSlug}#checkout`
        : `${site}/#checkout`,
    };

    const hashSequence = [
      params.key,
      txnid,
      amount,
      productinfo,
      name,
      email,
      udf1,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      env.EASEBUZZ_SALT
    ].join('|');

    params.hash = await sha512(hashSequence);

    const isTest =
      String(env.EASEBUZZ_ENV || '').toLowerCase() === 'test';

    const base = isTest
      ? 'https://testpay.easebuzz.in'
      : 'https://pay.easebuzz.in';

    // Save order before initiating payment
    await env.ORDERS_DB.prepare(`
      INSERT INTO orders
      (
        txnid,
        customer_name,
        email,
        phone,
        bump,
        amount,
        currency,
        status,
        created_at,
        page_slug,
        product_name,
        main_object_key,
        bump_object_key,
        bump_product_name,
        meta_pixel_id,
        meta_fbp,
        meta_fbc,
        client_ip_address,
        client_user_agent
      )
      VALUES (?, ?, ?, ?, ?, ?, 'INR', 'initiated', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      txnid,
      name,
      email,
      phone,
      bump ? 1 : 0,
      amount,
      Math.floor(Date.now() / 1000),
      pageSlug || null,
      productName,
      mainObjectKey,
      bumpObjectKey,
      bumpProductName,
      String(pageConfig.pixelId || env.META_PIXEL_ID || '').trim() || null,
      String(request.headers.get('cookie') || '').match(/(?:^|;\s*)_fbp=([^;]+)/)?.[1] || null,
      String(request.headers.get('cookie') || '').match(/(?:^|;\s*)_fbc=([^;]+)/)?.[1] || null,
      request.headers.get('CF-Connecting-IP') || '',
      request.headers.get('User-Agent') || ''
    ).run();

    // Request payment link from Easebuzz
    const response = await fetch(
      `${base}/payment/initiateLink`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(params),
      }
    );

    const responseText = await response.text();

    let result;

    try {
      result = JSON.parse(responseText);
    } catch (error) {
      console.error('EASEBUZZ_INVALID_RESPONSE:', {
        httpStatus: response.status,
        responsePreview: responseText.slice(0, 300),
      });

      await env.ORDERS_DB.prepare(
        "UPDATE orders SET status = 'initiation_failed' WHERE txnid = ? AND status = 'initiated'"
      ).bind(txnid).run();

      return json({
        error: 'Payment gateway temporarily unavailable. Please try again.'
      }, 502);
    }

    if (
      !response.ok ||
      Number(result.status) !== 1 ||
      !result.data
    ) {
      const providerError = String(
        result.error_desc ||
        result.message ||
        result.error ||
        `HTTP ${response.status}`
      ).slice(0, 300);

      console.error('EASEBUZZ_INITIATION_FAILED:', {
        httpStatus: response.status,
        status: result.status,
        error: providerError,
      });

      await env.ORDERS_DB.prepare(
        "UPDATE orders SET status = 'initiation_failed' WHERE txnid = ? AND status = 'initiated'"
      ).bind(txnid).run();

      return json({
        error: 'Payment gateway payment initiate nahi kar paya. Please try again.'
      }, 502);
    }

    // Return payment access key to checkout
    return json({
      access_key: result.data,
      key: env.EASEBUZZ_KEY,
      txnid,
      env: isTest ? 'test' : 'prod',
    });

  } catch (error) {
    console.error(
      'CREATE_PAYMENT_EXCEPTION:',
      error?.stack || error?.message || error
    );

    if (txnid && env.ORDERS_DB) {
      try {
        await env.ORDERS_DB.prepare(
          "UPDATE orders SET status = 'initiation_failed' WHERE txnid = ? AND status = 'initiated'"
        ).bind(txnid).run();
      } catch (dbError) {
        console.error(
          'ORDER_STATUS_UPDATE_FAILED:',
          dbError?.message || dbError
        );
      }
    }

    return json({
      error: 'Payment start karte waqt server error aaya. Dobara try karein.'
    }, 500);
  }
}
