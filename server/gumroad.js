// Оплата через Gumroad (для ИП в Грузии, где нет Stripe): окно оплаты Gumroad поверх сайта,
// Ping-уведомление о продаже и разблокировка по лицензионному ключу.
// Как и shop.js — без сети и Express: HTTP-клиент передаётся снаружи, функции возвращают Result.
// Ping не подписан, поэтому продажу всегда перепроверяем через API Gumroad.
import { timingSafeEqual } from 'crypto';
import { newToken, productOf } from './shop.js';

const API = 'https://api.gumroad.com/v2';
const REF_RE = /^grr_[A-Za-z0-9_-]{20,64}$/;
const SALE_RE = /^[A-Za-z0-9_=+/-]{6,64}$/;
const LICENSE_RE = /^[A-Za-z0-9-]{8,64}$/;

// ref — наш идентификатор покупки: уходит в ссылку на товар (?ref=), Gumroad возвращает его
// в Ping как url_params[ref], по нему сайт узнаёт, что оплата прошла
export const newRef = () => 'grr_' + newToken();
export const isValidRef = (r) => typeof r === 'string' && REF_RE.test(r);
export const isValidSaleId = (s) => typeof s === 'string' && SALE_RE.test(s);
export const isValidLicense = (k) => typeof k === 'string' && LICENSE_RE.test(k.trim());

export function gumroadConfig(env) {
  const cfg = {
    token: env.GUMROAD_ACCESS_TOKEN,
    pingSecret: env.GUMROAD_PING_SECRET,
    // product_id из Gumroad и ссылка на товар; продукт без настроек на сайте недоступен
    products: { pdf: env.GUMROAD_PRODUCT_PDF, web: env.GUMROAD_PRODUCT_WEB },
    urls: { pdf: env.GUMROAD_URL_PDF, web: env.GUMROAD_URL_WEB },
    // тестовые покупки продавца выдают гайд только если явно разрешено
    allowTest: env.GUMROAD_ALLOW_TEST === 'true',
  };
  const anyProduct = ['pdf', 'web'].some((k) => cfg.products[k] && cfg.urls[k]);
  return { ...cfg, enabled: Boolean(cfg.token && cfg.pingSecret && anyProduct) };
}

export const productAvailable = (cfg, product) => Boolean(cfg.products[product] && cfg.urls[product]);

export function checkoutUrl({ cfg, product }) {
  const key = productOf(product);
  if (!productAvailable(cfg, key)) return { ok: false, error: 'unavailable' };
  const ref = newRef();
  const url = new URL(cfg.urls[key]);
  // без wanted=true: с ним gumroad.js не открывает окно поверх сайта, а уводит на gumroad.com
  url.searchParams.set('ref', ref);
  return { ok: true, url: url.toString(), ref };
}

export function checkPingSecret(given, secret) {
  if (!secret || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Продукт определяем по product_id из подтверждённой API продажи
export function productOfSale(sale, products) {
  const id = String(sale?.product_id ?? '');
  if (id && id === String(products.web)) return 'web';
  if (id && id === String(products.pdf)) return 'pdf';
  return null;
}

// Продажа из API → объект в форме Stripe-сессии для shop.fulfillSession
export function saleToSession(sale, { products, allowTest = false }, ref) {
  if (!sale?.id) return { ok: false, error: 'bad_sale' };
  const product = productOfSale(sale, products);
  if (!product) return { ok: false, error: 'unknown_product' };
  if (sale.test && !allowTest) return { ok: false, error: 'test_sale' };
  const voided = sale.refunded || sale.chargedback || sale.partially_refunded;
  return {
    ok: true,
    session: {
      id: isValidRef(ref) ? ref : `gr_${sale.id}`,
      payment_status: voided ? 'refunded' : 'paid',
      amount_total: Number(sale.price) || 0,
      currency: String(sale.currency || 'usd').toLowerCase(),
      customer_details: { email: sale.email || sale.purchase_email || '' },
      metadata: { product },
      ext_sale: String(sale.id),
    },
  };
}

// fetchJson(url, init) → { status, json } — внедряется, чтобы тестировать без сети
export async function fetchSale(saleId, { cfg }, { fetchJson }) {
  if (!isValidSaleId(saleId)) return { ok: false, error: 'bad_request' };
  let res;
  try {
    res = await fetchJson(`${API}/sales/${encodeURIComponent(saleId)}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
  } catch (e) {
    return { ok: false, error: 'network', detail: e.message };
  }
  // Gumroad на несуществующую продажу отвечает 404 или 200 с success:false
  if (res.status === 404 || (res.status === 200 && res.json?.success === false)) return { ok: false, error: 'not_found' };
  if (res.status !== 200 || !res.json?.success || !res.json.sale) return { ok: false, error: 'api_error', detail: `HTTP ${res.status}` };
  return { ok: true, sale: res.json.sale };
}

// Ping (form-urlencoded) → подтверждённая сессия. Данным из Ping доверяем только sale_id и ref.
export async function pingToSession(body, { cfg }, { fetchJson }) {
  const saleId = String(body?.sale_id || '');
  const fetched = await fetchSale(saleId, { cfg }, { fetchJson });
  if (!fetched.ok) return fetched;
  const ref = body?.url_params?.ref ?? body?.['url_params[ref]'];
  return saleToSession(fetched.sale, cfg, ref);
}

// Лицензионный ключ из чека Gumroad → продажа (проверяем по каждому нашему товару)
export async function licenseToSale(key, { cfg }, { fetchJson }) {
  if (!isValidLicense(key)) return { ok: false, error: 'bad_request' };
  for (const productId of Object.values(cfg.products).filter(Boolean)) {
    let res;
    try {
      res = await fetchJson(`${API}/licenses/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ product_id: productId, license_key: key.trim(), increment_uses_count: 'false' }).toString(),
      });
    } catch (e) {
      return { ok: false, error: 'network', detail: e.message };
    }
    const purchase = res.json?.success ? res.json.purchase : null;
    if (purchase?.sale_id) return { ok: true, saleId: purchase.sale_id };
  }
  return { ok: false, error: 'not_found' };
}
