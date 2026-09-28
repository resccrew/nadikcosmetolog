import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MAIL_JSON_TRANSPORT = 'true';
process.env.MAIL_FROM = 'site@example.com';
process.env.MAIL_TO = 'doctor@example.com';
const { sendBookingConfirmation } = await import('../mailer.js');

const send = async (args) => JSON.parse((await sendBookingConfirmation(args)).message);

test('booking confirmation: goes to the client, RU by default, replies go to the doctor', async () => {
  const m = await send({ name: 'Анна', email: 'anna@example.com' });
  assert.equal(m.to[0].address, 'anna@example.com');
  assert.equal(m.replyTo[0].address, 'doctor@example.com');
  assert.equal(m.subject, 'Ваша заявка получена');
  assert.match(m.text, /Здравствуйте, Анна!/);
});

test('booking confirmation: EN version', async () => {
  const m = await send({ name: 'Anna', email: 'anna@example.com', lang: 'en' });
  assert.equal(m.subject, 'Your request has been received');
});

test('booking confirmation: name is HTML-escaped', async () => {
  const m = await send({ name: '<script>x</script>', email: 'a@example.com' });
  assert.ok(!m.html.includes('<script>'));
});

test('resend: posts to Resend API with base64 attachment when key is set', async () => {
  const { writeFileSync, mkdtempSync } = await import('fs');
  const { join } = await import('path');
  const { tmpdir } = await import('os');
  const pdf = join(mkdtempSync(join(tmpdir(), 'rs-')), 'g.pdf');
  writeFileSync(pdf, 'PDFDATA');
  const { sendGuideMail } = await import('../mailer.js');

  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return new Response('{"id":"x"}', { status: 200 }); };
  process.env.RESEND_API_KEY = 're_test';
  process.env.MAIL_JSON_TRANSPORT = 'false';
  try {
    await sendGuideMail({ email: 'buyer@example.com', token: 'tok', pdfPath: pdf, siteUrl: 'https://x.com' });
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
    process.env.MAIL_JSON_TRANSPORT = 'true';
  }
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer re_test');
  const body = JSON.parse(calls[0].opts.body);
  assert.deepEqual(body.to, ['buyer@example.com']);
  assert.equal(Buffer.from(body.attachments[0].content, 'base64').toString(), 'PDFDATA');
  assert.match(body.html, /guide\/access\?token=tok/);
});

test('resend: API error is thrown (caller logs it)', async () => {
  const { sendBookingConfirmation } = await import('../mailer.js');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('bad from', { status: 422 });
  process.env.RESEND_API_KEY = 're_test';
  process.env.MAIL_JSON_TRANSPORT = 'false';
  try {
    await assert.rejects(sendBookingConfirmation({ name: 'A', email: 'a@example.com' }), /Resend 422/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
    process.env.MAIL_JSON_TRANSPORT = 'true';
  }
});
