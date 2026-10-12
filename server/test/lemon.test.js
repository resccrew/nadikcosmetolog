import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'lemon-')), 'test.sqlite');
let db, shop, lemon;
before(async () => {
  db = await import('../db.js');
  shop = await import('../shop.js');
  lemon = await import('../lemon.js');
});

const variants = { pdf: '111', web: '222' };
const cfg = { apiKey: 'k', storeId: '492964', variants, webhookSecret: 's3cret', enabled: true };

const orderEvent = ({ ref, variant = 111, status = 'paid', email = 'anna@example.com', id = 9001 } = {}) => ({
  meta: { event_name: 'order_created', test_mode: true, custom_data: ref ? { ref } : undefined },
  data: {
    type: 'orders', id: String(id),
    attributes: { status, total: 499, currency: 'USD', user_email: email, first_order_item: { variant_id: variant } },
  },
});

test('lemonConfig: enabled only with key, store and both variants', () => {
  assert.equal(lemon.lemonConfig({}).enabled, false);
  assert.equal(lemon.lemonConfig({ LEMONSQUEEZY_API_KEY: 'k', LEMONSQUEEZY_STORE_ID: '1', LEMONSQUEEZY_VARIANT_PDF: '2' }).enabled, false);
  assert.equal(lemon.lemonConfig({ LEMONSQUEEZY_API_KEY: 'k', LEMONSQUEEZY_STORE_ID: '1', LEMONSQUEEZY_VARIANT_PDF: '2', LEMONSQUEEZY_VARIANT_WEB: '3' }).enabled, true);
});

test('checkoutBody: store, variant, ref in custom data and redirect url', () => {
  const ref = lemon.newRef();
  const b = lemon.checkoutBody({ storeId: '492964', variantId: '222', siteUrl: 'https://x.com', ref, product: 'web' });
  assert.equal(b.data.relationships.store.data.id, '492964');
  assert.equal(b.data.relationships.variant.data.id, '222');
  assert.deepEqual(b.data.attributes.checkout_data.custom, { ref, product: 'web' });
  assert.equal(b.data.attributes.product_options.redirect_url, `https://x.com/guide/access?ref=${ref}`);
  assert.ok(lemon.isValidRef(ref));
});

test('createCheckout: picks variant by product, returns url and ref', async () => {
  let sent;
  const fetchJson = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return { status: 201, json: { data: { attributes: { url: 'https://store.lemonsqueezy.com/checkout/abc' } } } };
  };
  const r = await lemon.createCheckout({ cfg, siteUrl: 'https://x.com', product: 'web' }, { fetchJson });
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://store.lemonsqueezy.com/checkout/abc');
  assert.equal(sent.url, 'https://api.lemonsqueezy.com/v1/checkouts');
  assert.equal(sent.init.headers.Authorization, 'Bearer k');
  assert.equal(sent.body.data.relationships.variant.data.id, '222');
  assert.equal(sent.body.data.attributes.checkout_data.custom.ref, r.ref);
});

test('createCheckout: API error and network error become Result errors', async () => {
  const bad = await lemon.createCheckout({ cfg, siteUrl: 'x', product: 'pdf' }, { fetchJson: async () => ({ status: 422, json: { errors: [] } }) });
  assert.deepEqual([bad.ok, bad.error], [false, 'api_error']);
  const down = await lemon.createCheckout({ cfg, siteUrl: 'x', product: 'pdf' }, { fetchJson: async () => { throw new Error('ECONNRESET'); } });
  assert.deepEqual([down.ok, down.error], [false, 'network']);
});

test('verifySignature: accepts correct HMAC, rejects wrong or missing', () => {
  const body = Buffer.from('{"a":1}');
  const sig = createHmac('sha256', 's3cret').update(body).digest('hex');
  assert.equal(lemon.verifySignature(body, sig, 's3cret'), true);
  assert.equal(lemon.verifySignature(body, sig, 'other'), false);
  assert.equal(lemon.verifySignature(Buffer.from('{"a":2}'), sig, 's3cret'), false);
  assert.equal(lemon.verifySignature(body, undefined, 's3cret'), false);
  assert.equal(lemon.verifySignature(body, 'zz', 's3cret'), false);
  assert.equal(lemon.verifySignature(body, sig, ''), false);
});

test('orderToSession: test-mode order rejected unless allowTest', () => {
  assert.equal(lemon.orderToSession(orderEvent({ ref: lemon.newRef() }), { variants }).error, 'test_mode');
  assert.equal(lemon.orderToSession(orderEvent({ ref: lemon.newRef() }), { variants, allowTest: true }).ok, true);
  assert.equal(lemon.lemonConfig({ LEMONSQUEEZY_ALLOW_TEST: 'true' }).allowTest, true);
  assert.equal(lemon.lemonConfig({}).allowTest, false);
});

test('orderToSession: maps paid order, product comes from variant not custom data', () => {
  const ref = lemon.newRef();
  const ev = orderEvent({ ref, variant: 222 });
  ev.meta.custom_data.product = 'pdf';
  const r = lemon.orderToSession(ev, { variants, allowTest: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.session, {
    id: ref, payment_status: 'paid', amount_total: 499, currency: 'usd',
    customer_details: { email: 'anna@example.com' }, metadata: { product: 'web' },
  });
});

test('orderToSession: other events ignored, unknown variant and bad payload rejected', () => {
  assert.equal(lemon.orderToSession({ meta: { event_name: 'order_refunded' } }, { variants }).error, 'ignored');
  assert.equal(lemon.orderToSession(orderEvent({ variant: 999 }), { variants, allowTest: true }).error, 'unknown_variant');
  assert.equal(lemon.orderToSession({ meta: { event_name: 'order_created' } }, { variants }).error, 'bad_payload');
});

test('orderToSession: missing or invalid ref falls back to LS order id', () => {
  assert.equal(lemon.orderToSession(orderEvent({ id: 77 }), { variants, allowTest: true }).session.id, 'lso_77');
  assert.equal(lemon.orderToSession(orderEvent({ ref: '../evil', id: 78 }), { variants, allowTest: true }).session.id, 'lso_78');
});

test('end to end: webhook order is fulfilled once and found by ref', async () => {
  const ref = lemon.newRef();
  const mails = [];
  const deps = { db, sendGuide: async (m) => mails.push(m) };
  const { session } = lemon.orderToSession(orderEvent({ ref, email: 'buyer@example.com' }), { variants, allowTest: true });
  const a = await shop.fulfillSession(session, deps);
  const b = await shop.fulfillSession(session, deps);
  assert.equal(a.ok, true);
  assert.equal(a.order.id, b.order.id);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].product, 'pdf');
  assert.match(mails[0].promoCode, /^NA10-[A-Z0-9]{6}$/);
  assert.equal(db.getOrderBySession(ref).email, 'buyer@example.com');
});

test('unpaid LS order is not fulfilled', async () => {
  const ref = lemon.newRef();
  const { session } = lemon.orderToSession(orderEvent({ ref, status: 'pending' }), { variants, allowTest: true });
  const r = await shop.fulfillSession(session, { db, sendGuide: async () => assert.fail('no mail') });
  assert.deepEqual(r, { ok: false, error: 'not_paid' });
  assert.equal(db.getOrderBySession(ref), undefined);
});
