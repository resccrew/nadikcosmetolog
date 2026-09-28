// Продажа PDF-гайда через Stripe Checkout.
// Логика отделена от Express и Stripe SDK (зависимости передаются снаружи) —
// так её можно тестировать без сети. Функции возвращают Result: { ok, ... } / { ok:false, error }.
import { randomBytes } from 'crypto';

export const newToken = () => randomBytes(24).toString('base64url');

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]+$/;

export const isValidToken = (t) => typeof t === 'string' && TOKEN_RE.test(t);
export const isValidSessionId = (s) => typeof s === 'string' && SESSION_RE.test(s);

// Параметры Checkout Session. Цена — из Stripe (STRIPE_PRICE_ID) или inline $7.99.
export function checkoutParams({ siteUrl, priceId, lang }) {
  const lineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: 799,
          product_data: { name: 'Гайд «Самостоятельная консультация трихолога» (PDF)' },
        },
      };
  return {
    mode: 'payment',
    line_items: [lineItem],
    customer_creation: 'if_required',
    locale: lang === 'en' ? 'en' : 'ru',
    success_url: `${siteUrl}/guide/access?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/#guide`,
  };
}

// Выдача заказа по оплаченной сессии. Идемпотентно: повторный вызов
// (вебхук + страница успеха, повтор вебхука) вернёт тот же заказ и не отправит письмо дважды.
export async function fulfillSession(session, { db, sendGuide }) {
  if (!session || session.payment_status !== 'paid')
    return { ok: false, error: 'not_paid' };

  const email = session.customer_details?.email || session.customer_email || '';
  db.createOrder({
    sessionId: session.id,
    email,
    amount: session.amount_total,
    currency: session.currency,
    token: newToken(),
  });
  const order = db.getOrderBySession(session.id);
  if (!order) return { ok: false, error: 'db_error' };

  if (order.email && db.claimOrderEmail(order.id)) {
    try {
      await sendGuide({ email: order.email, token: order.token });
    } catch (e) {
      db.releaseOrderEmail(order.id);
      // письмо не ушло — доступ всё равно есть через страницу; повторим на следующем вызове
      console.error('Guide mail failed:', e.message);
    }
  }
  return { ok: true, order };
}

// Доступ со страницы успеха: ищем заказ по session_id, а если вебхук ещё
// не дошёл — сами спрашиваем Stripe и выдаём.
export async function accessBySession(sessionId, { db, retrieveSession, sendGuide }) {
  if (!isValidSessionId(sessionId)) return { ok: false, error: 'bad_request' };

  const existing = db.getOrderBySession(sessionId);
  if (existing) return { ok: true, order: existing };

  let session;
  try {
    session = await retrieveSession(sessionId);
  } catch {
    return { ok: false, error: 'not_found' };
  }
  return fulfillSession(session, { db, sendGuide });
}

export function accessByToken(token, { db }) {
  if (!isValidToken(token)) return { ok: false, error: 'bad_request' };
  const order = db.getOrderByToken(token);
  if (!order) return { ok: false, error: 'not_found' };
  return { ok: true, order };
}

// Маскируем email для показа на странице: an***@gmail.com
export function maskEmail(email = '') {
  const [user, domain] = String(email).split('@');
  if (!domain) return '';
  return `${user.slice(0, 2)}***@${domain}`;
}
