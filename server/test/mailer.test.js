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
