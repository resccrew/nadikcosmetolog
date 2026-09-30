import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Отдельная временная база, чтобы не трогать data.sqlite
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'shop-')), 'test.sqlite');
let db, shop;
before(async () => {
  db = await import('../db.js');
  shop = await import('../shop.js');
});

const paid = (id, email = 'anna@example.com') => ({
  id, payment_status: 'paid', amount_total: 799, currency: 'usd',
  customer_details: { email },
});

test('checkoutParams: inline price and success url with session placeholder', () => {
  const p = shop.checkoutParams({ siteUrl: 'https://x.com', lang: 'en' });
  assert.equal(p.mode, 'payment');
  assert.equal(p.line_items[0].price_data.unit_amount, 799);
  assert.equal(p.success_url, 'https://x.com/guide/access?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(p.locale, 'en');
  assert.deepEqual(shop.checkoutParams({ siteUrl: 'x', priceId: 'price_1' }).line_items[0], { price: 'price_1', quantity: 1 });
});

test('fulfillSession: unpaid session is rejected, nothing sent', async () => {
  let sent = 0;
  const r = await shop.fulfillSession({ id: 'cs_test_unpaid', payment_status: 'unpaid' }, { db, sendGuide: async () => sent++ });
  assert.deepEqual(r, { ok: false, error: 'not_paid' });
  assert.equal(sent, 0);
  assert.equal(db.getOrderBySession('cs_test_unpaid'), undefined);
});

test('fulfillSession: idempotent — one order, one email on repeated webhook', async () => {
  const mails = [];
  const deps = { db, sendGuide: async (m) => mails.push(m) };
  const a = await shop.fulfillSession(paid('cs_test_A'), deps);
  const b = await shop.fulfillSession(paid('cs_test_A'), deps);
  assert.ok(a.ok && b.ok);
  assert.equal(a.order.token, b.order.token);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].email, 'anna@example.com');
  assert.ok(shop.isValidToken(a.order.token));
});

test('fulfillSession: failed email is retried on next call', async () => {
  let calls = 0;
  const flaky = { db, sendGuide: async () => { calls++; if (calls === 1) throw new Error('smtp down'); } };
  assert.ok((await shop.fulfillSession(paid('cs_test_B'), flaky)).ok);
  assert.equal(db.getOrderBySession('cs_test_B').emailed, 0);
  await shop.fulfillSession(paid('cs_test_B'), flaky);
  assert.equal(calls, 2);
  assert.equal(db.getOrderBySession('cs_test_B').emailed, 1);
});

test('accessBySession: falls back to Stripe when webhook has not arrived', async () => {
  const r = await shop.accessBySession('cs_test_C', {
    db, sendGuide: async () => {}, retrieveSession: async (id) => paid(id),
  });
  assert.ok(r.ok);
  assert.equal(db.getOrderBySession('cs_test_C').token, r.order.token);
});

test('accessBySession: invalid id and unknown session', async () => {
  const deps = { db, sendGuide: async () => {}, retrieveSession: async () => { throw new Error('404'); } };
  assert.equal((await shop.accessBySession('../etc', deps)).error, 'bad_request');
  assert.equal((await shop.accessBySession('cs_test_missing', deps)).error, 'not_found');
});

test('accessByToken: valid, unknown, malformed', async () => {
  const { order } = await shop.fulfillSession(paid('cs_test_D'), { db, sendGuide: async () => {} });
  assert.equal(shop.accessByToken(order.token, { db }).order.id, order.id);
  assert.equal(shop.accessByToken('x'.repeat(32), { db }).error, 'not_found');
  assert.equal(shop.accessByToken("' OR 1=1 --", { db }).error, 'bad_request');
});

test('maskEmail', () => {
  assert.equal(shop.maskEmail('anna@gmail.com'), 'an***@gmail.com');
  assert.equal(shop.maskEmail(''), '');
});

test('fulfillSession: concurrent calls send only one email', async () => {
  let sent = 0;
  const deps = { db, sendGuide: async () => { sent++; await new Promise((r) => setTimeout(r, 20)); } };
  await Promise.all([shop.fulfillSession(paid('cs_test_RACE'), deps), shop.fulfillSession(paid('cs_test_RACE'), deps)]);
  assert.equal(sent, 1);
});
