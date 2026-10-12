// Оплата через Lemon Squeezy: создание checkout и разбор вебхука order_created.
// Как и shop.js — без сети и Express: HTTP-клиент передаётся снаружи, функции возвращают Result.
// Заказ LS приводится к той же форме, что сессия Stripe, и выдаётся через shop.fulfillSession.
import { createHmac, timingSafeEqual } from 'crypto';
import { newToken, productOf } from './shop.js';

const API = 'https://api.lemonsqueezy.com/v1';
const REF_RE = /^lsr_[A-Za-z0-9_-]{20,64}$/;

// ref — наш идентификатор покупки: уходит в checkout custom data и в redirect_url,
// по нему страница успеха находит заказ, когда придёт вебхук
export const newRef = () => 'lsr_' + newToken();
export const isValidRef = (r) => typeof r === 'string' && REF_RE.test(r);

export function lemonConfig(env) {
  const cfg = {
    apiKey: env.LEMONSQUEEZY_API_KEY,
    storeId: env.LEMONSQUEEZY_STORE_ID,
    variants: { pdf: env.LEMONSQUEEZY_VARIANT_PDF, web: env.LEMONSQUEEZY_VARIANT_WEB },
    webhookSecret: env.LEMONSQUEEZY_WEBHOOK_SECRET,
    // тестовые заказы (test mode) выдают гайд только если явно разрешено — для проверки до запуска
    allowTest: env.LEMONSQUEEZY_ALLOW_TEST === 'true',
  };
  const enabled = Boolean(cfg.apiKey && cfg.storeId && cfg.variants.pdf && cfg.variants.web);
  return { ...cfg, enabled };
}

export function checkoutBody({ storeId, variantId, siteUrl, ref, product, email }) {
  return {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: { custom: { ref, product: productOf(product) }, ...(email ? { email } : {}) },
        product_options: { redirect_url: `${siteUrl}/guide/access?ref=${ref}`, enabled_variants: [Number(variantId)] },
        checkout_options: { embed: false },
      },
      relationships: {
        store: { data: { type: 'stores', id: String(storeId) } },
        variant: { data: { type: 'variants', id: String(variantId) } },
      },
    },
  };
}

// fetchJson(url, init) → { status, json } — внедряется, чтобы тестировать без сети
export async function createCheckout({ cfg, siteUrl, product }, { fetchJson }) {
  const key = productOf(product);
  const ref = newRef();
  const body = checkoutBody({ storeId: cfg.storeId, variantId: cfg.variants[key], siteUrl, ref, product: key });
  let res;
  try {
    res = await fetchJson(`${API}/checkouts`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: 'network', detail: e.message };
  }
  const url = res?.json?.data?.attributes?.url;
  if (res.status !== 201 || !url) return { ok: false, error: 'api_error', detail: `HTTP ${res.status}` };
  return { ok: true, url, ref };
}

// Подпись X-Signature: HMAC-SHA256 (hex) от сырого тела запроса
export function verifySignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

// Вебхук order_created → объект в форме Stripe-сессии для fulfillSession.
// Продукт определяем по variant_id из заказа (а не по custom data из браузера).
export function orderToSession(payload, { variants, allowTest = false }) {
  if (payload?.meta?.event_name !== 'order_created') return { ok: false, error: 'ignored' };
  const order = payload.data;
  const a = order?.attributes;
  if (!a) return { ok: false, error: 'bad_payload' };
  if ((a.test_mode || payload.meta.test_mode) && !allowTest) return { ok: false, error: 'test_mode' };

  const variantId = String(a.first_order_item?.variant_id ?? '');
  const product = variantId === String(variants.web) ? 'web' : variantId === String(variants.pdf) ? 'pdf' : null;
  if (!product) return { ok: false, error: 'unknown_variant' };

  const ref = payload.meta.custom_data?.ref;
  return {
    ok: true,
    session: {
      id: isValidRef(ref) ? ref : `lso_${order.id}`,
      payment_status: a.status === 'paid' ? 'paid' : 'unpaid',
      amount_total: a.total,
      currency: String(a.currency || '').toLowerCase(),
      customer_details: { email: a.user_email || '' },
      metadata: { product },
    },
  };
}
