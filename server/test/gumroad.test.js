import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'gumroad-')), 'test.sqlite');
let db, shop, gr;
before(async () => {
  db = await import('../db.js');
  shop = await import('../shop.js');
  gr = await import('../gumroad.js');
});

const cfg = {
  token: 't0k', pingSecret: 'p1ng', allowTest: false,
  products: { pdf: 'PDF==', web: 'WEB==' },
  urls: { pdf: 'https://pravorova.gumroad.com/l/ayckvb', web: 'https://pravorova.gumroad.com/l/pteuax' },
};
const sale = (over = {}) => ({ id: 'SaLe123==', product_id: 'WEB==', email: 'anna@example.com', price: 799, refunded: false, ...over });
const api = (s, status = 200) => async () => ({ status, json: s ? { success: true, sale: s } : { success: false } });

test('gumroadConfig: enabled with token, ping secret and at least one product', () => {
  assert.equal(gr.gumroadConfig({}).enabled, false);
  assert.equal(gr.gumroadConfig({ GUMROAD_ACCESS_TOKEN: 't', GUMROAD_PING_SECRET: 's' }).enabled, false);
  const c = gr.gumroadConfig({ GUMROAD_ACCESS_TOKEN: 't', GUMROAD_PING_SECRET: 's', GUMROAD_PRODUCT_WEB: 'W', GUMROAD_URL_WEB: 'https://x/l/w' });
  assert.equal(c.enabled, true);
  assert.equal(gr.productAvailable(c, 'web'), true);
  assert.equal(gr.productAvailable(c, 'pdf'), false);
});

test('checkoutUrl: product link with wanted=true and our ref; unconfigured product unavailable', () => {
  const r = gr.checkoutUrl({ cfg, product: 'web' });
  assert.equal(r.ok, true);
  const u = new URL(r.url);
  assert.equal(u.origin + u.pathname, 'https://pravorova.gumroad.com/l/pteuax');
  assert.equal(u.searchParams.get('wanted'), 'true');
  assert.equal(u.searchParams.get('ref'), r.ref);
  assert.ok(gr.isValidRef(r.ref));
  const only = { ...cfg, products: { web: 'WEB==' }, urls: { web: cfg.urls.web } };
  assert.deepEqual(gr.checkoutUrl({ cfg: only, product: 'pdf' }), { ok: false, error: 'unavailable' });
});

test('checkPingSecret: exact match only', () => {
  assert.equal(gr.checkPingSecret('p1ng', 'p1ng'), true);
  assert.equal(gr.checkPingSecret('p1nG', 'p1ng'), false);
  assert.equal(gr.checkPingSecret('p1n', 'p1ng'), false);
  assert.equal(gr.checkPingSecret(undefined, 'p1ng'), false);
  assert.equal(gr.checkPingSecret('x', ''), false);
});

test('saleToSession: product from product_id, ref kept, sale id stored', () => {
  const ref = gr.newRef();
  const r = gr.saleToSession(sale(), cfg, ref);
  assert.deepEqual(r.session, {
    id: ref, payment_status: 'paid', amount_total: 799, currency: 'usd',
    customer_details: { email: 'anna@example.com' }, metadata: { product: 'web' }, ext_sale: 'SaLe123==',
  });
  assert.equal(gr.saleToSession(sale({ product_id: 'PDF==' }), cfg).session.metadata.product, 'pdf');
  assert.equal(gr.saleToSession(sale(), cfg, '../x').session.id, 'gr_SaLe123==');
});

test('saleToSession: refunds/chargebacks are not paid, foreign product and test sale rejected', () => {
  assert.equal(gr.saleToSession(sale({ refunded: true }), cfg).session.payment_status, 'refunded');
  assert.equal(gr.saleToSession(sale({ chargedback: true }), cfg).session.payment_status, 'refunded');
  assert.equal(gr.saleToSession(sale({ product_id: 'OTHER' }), cfg).error, 'unknown_product');
  assert.equal(gr.saleToSession(sale({ test: true }), cfg).error, 'test_sale');
  assert.equal(gr.saleToSession(sale({ test: true }), { ...cfg, allowTest: true }).ok, true);
  assert.equal(gr.saleToSession({}, cfg).error, 'bad_sale');
});

test('pingToSession: trusts API sale, not ping body', async () => {
  let called;
  const fetchJson = async (url, init) => {
    called = { url, auth: init.headers.Authorization };
    return { status: 200, json: { success: true, sale: sale({ product_id: 'PDF==', price: 499 }) } };
  };
  const ref = gr.newRef();
  const body = { sale_id: 'SaLe123==', product_id: 'WEB==', price: '1', url_params: { ref } };
  const r = await gr.pingToSession(body, { cfg }, { fetchJson });
  assert.equal(called.url, 'https://api.gumroad.com/v2/sales/SaLe123%3D%3D');
  assert.equal(called.auth, 'Bearer t0k');
  assert.equal(r.session.id, ref);
  assert.equal(r.session.metadata.product, 'pdf');
  assert.equal(r.session.amount_total, 499);
});

test('pingToSession: bad sale id, unknown sale and API failures', async () => {
  assert.equal((await gr.pingToSession({ sale_id: '' }, { cfg }, { fetchJson: api(sale()) })).error, 'bad_request');
  assert.equal((await gr.pingToSession({ sale_id: 'NoSuch1' }, { cfg }, { fetchJson: api(null, 404) })).error, 'not_found');
  assert.equal((await gr.pingToSession({ sale_id: 'NoSuch2' }, { cfg }, { fetchJson: api(null, 200) })).error, 'not_found');
  assert.equal((await gr.pingToSession({ sale_id: 'SaLe123' }, { cfg }, { fetchJson: api(null, 500) })).error, 'api_error');
  const down = async () => { throw new Error('ETIMEDOUT'); };
  assert.equal((await gr.pingToSession({ sale_id: 'SaLe123' }, { cfg }, { fetchJson: down })).error, 'network');
});

test('licenseToSale: finds sale across our products, rejects unknown key', async () => {
  const seen = [];
  const fetchJson = async (url, init) => {
    const p = new URLSearchParams(init.body);
    seen.push(p.get('product_id'));
    assert.equal(p.get('increment_uses_count'), 'false');
    return p.get('product_id') === 'WEB=='
      ? { status: 200, json: { success: true, purchase: { sale_id: 'SaLe123==' } } }
      : { status: 404, json: { success: false } };
  };
  assert.deepEqual(await gr.licenseToSale('ABCD1234-ABCD1234-ABCD1234-ABCD1234', { cfg }, { fetchJson }), { ok: true, saleId: 'SaLe123==' });
  assert.deepEqual(seen, ['PDF==', 'WEB==']);
  const none = async () => ({ status: 404, json: { success: false } });
  assert.equal((await gr.licenseToSale('ABCD1234-ABCD1234', { cfg }, { fetchJson: none })).error, 'not_found');
  assert.equal((await gr.licenseToSale('bad key!', { cfg }, { fetchJson: none })).error, 'bad_request');
});

test('end to end: ping order found by ref and by sale id, fulfilled once', async () => {
  const ref = gr.newRef();
  const mails = [];
  const deps = { db, sendGuide: async (m) => mails.push(m) };
  const { session } = gr.saleToSession(sale({ id: 'E2E-1' }), cfg, ref);
  await shop.fulfillSession(session, deps);
  await shop.fulfillSession(session, deps);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].product, 'web');
  assert.equal(db.getOrderBySession(ref).ext_sale, 'E2E-1');
  assert.equal(db.getOrderByExtSale('E2E-1').session_id, ref);
});

test('refunded sale is not fulfilled', async () => {
  const { session } = gr.saleToSession(sale({ id: 'E2E-2', refunded: true }), cfg, gr.newRef());
  const r = await shop.fulfillSession(session, { db, sendGuide: async () => assert.fail('no mail') });
  assert.deepEqual(r, { ok: false, error: 'not_paid' });
  assert.equal(db.getOrderByExtSale('E2E-2'), undefined);
});
