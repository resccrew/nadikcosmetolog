import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import Stripe from 'stripe';
import { sendBookingMail, sendBookingConfirmation, sendGuideMail, sendPurchaseNotice, sendGuideResults } from './mailer.js';
import * as db from './db.js';
import { saveBooking, saveVisit, getBookings, getStats } from './db.js';
import { checkoutParams, fulfillSession, accessBySession, accessByToken, accessUrl, maskEmail, productOf, redeemPromoCode } from './shop.js';
import { lemonConfig, createCheckout, verifySignature, orderToSession, isValidRef } from './lemon.js';
import * as gumroad from './gumroad.js';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1); // за nginx — чтобы rate-limit видел реальный IP

// ── Stripe: продажа PDF-гайда ──
const SITE_URL = (process.env.SITE_URL || 'https://nadezdantiage.com').replace(/\/$/, '');
const GUIDE_PDF = process.env.GUIDE_PDF_PATH || join(__dirname, 'private', 'guide.pdf');
const GUIDE_WEB = process.env.GUIDE_WEB_PATH || join(__dirname, 'private', 'guide-web.html');
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
// Lemon Squeezy включается, когда заданы ключ, магазин и оба варианта; иначе — Stripe
const lemon = lemonConfig(process.env);
// Gumroad — для ИП в Грузии (Stripe там недоступен); если настроен, имеет приоритет
const gr = gumroad.gumroadConfig(process.env);
const fetchJson = async (url, init) => {
  const r = await fetch(url, init);
  return { status: r.status, json: await r.json().catch(() => null) };
};

const shopDeps = {
  db,
  retrieveSession: (id) => stripe.checkout.sessions.retrieve(id),
  sendGuide: ({ email, token, product, promoCode }) =>
    sendGuideMail({ email, token, product, promoCode, pdfPath: GUIDE_PDF, siteUrl: SITE_URL }),
  notifyOwner: ({ email, amount, currency, createdAt, product, promoCode }) =>
    sendPurchaseNotice({ email, amount, currency, createdAt, product, promoCode }),
};

// Вебхук регистрируется ДО express.json — Stripe подписывает сырое тело запроса
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).end();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    console.error('Stripe webhook signature failed:', e.message);
    return res.status(400).send('Bad signature');
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const result = await fulfillSession(event.data.object, shopDeps);
    if (!result.ok && result.error !== 'not_paid') return res.status(500).end();
  }
  res.json({ received: true });
});

// Вебхук Lemon Squeezy: подпись X-Signature от сырого тела, событие order_created
app.post('/api/lemonsqueezy/webhook', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  if (!lemon.enabled || !lemon.webhookSecret) return res.status(503).end();
  if (!verifySignature(req.body, req.headers['x-signature'], lemon.webhookSecret)) {
    console.error('Lemon Squeezy webhook signature failed');
    return res.status(400).send('Bad signature');
  }
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Bad JSON');
  }
  const mapped = orderToSession(payload, lemon);
  if (!mapped.ok) {
    if (mapped.error !== 'ignored') console.error('Lemon Squeezy webhook skipped:', mapped.error);
    return res.json({ received: true });
  }
  const result = await fulfillSession(mapped.session, shopDeps);
  if (!result.ok && result.error !== 'not_paid') return res.status(500).end();
  res.json({ received: true });
});

// Gumroad Ping: секрет в адресе (Ping не подписан), продажу перепроверяем через API
app.post('/api/gumroad/ping/:secret', express.urlencoded({ extended: true, limit: '64kb' }), async (req, res) => {
  if (!gr.enabled || !gumroad.checkPingSecret(req.params.secret, gr.pingSecret)) return res.status(404).end();
  const mapped = await gumroad.pingToSession(req.body, { cfg: gr }, { fetchJson });
  if (!mapped.ok) {
    console.error('Gumroad ping skipped:', mapped.error, mapped.detail || '');
    // ошибка сети/API — 500, чтобы Gumroad повторил; остальное подтверждаем
    return res.status(['network', 'api_error'].includes(mapped.error) ? 500 : 200).end();
  }
  // заказ по этой продаже уже мог создаться (например, по лицензионному ключу)
  if (db.getOrderByExtSale(mapped.session.ext_sale)) return res.status(200).end();
  const result = await fulfillSession(mapped.session, shopDeps);
  if (!result.ok && result.error !== 'not_paid') return res.status(500).end();
  res.status(200).end();
});

app.use(express.json({ limit: '10kb' }));

// ── CORS: только разрешённые домены ──
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      // запросы без origin (curl, серверные) — пропускаем
      if (!origin || allowed.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
  })
);

// ── Лимит: не больше 5 заявок за 10 минут с одного IP ──
const bookingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Слишком много заявок. Попробуйте позже.' },
});

// ── Проверка живости ──
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Приём заявки ──
app.post('/api/booking', bookingLimiter, async (req, res) => {
  try {
    const { name, phone, email, message, lang, promo, _honey } = req.body || {};

    // honeypot: если бот заполнил скрытое поле — молча отвечаем «ок»
    if (_honey) return res.json({ ok: true });

    // ── Валидация: имя и email обязательны ──
    const errors = {};
    if (!name || String(name).trim().length < 2) errors.name = 'Укажите имя';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) errors.email = 'Укажите корректный email';
    if (Object.keys(errors).length)
      return res.status(400).json({ ok: false, errors });

    // Промокод −10% (выдаётся покупателям гайда): проверяем и гасим
    const promoResult = promo && String(promo).trim() ? redeemPromoCode(promo, { db }) : null;

    const data = {
      name: String(name).trim(),
      phone: phone ? String(phone).trim() : '',
      email: String(email).trim(),
      message: message ? String(message).trim() : '',
      ip: req.ip,
      promo: promoResult,
    };

    // 1) СНАЧАЛА сохраняем заявку в базу — она не потеряется, даже если письмо не уйдёт
    // в базе промокод дописываем к запросу — чтобы он был виден в админке
    saveBooking({
      ...data,
      message: [data.message, promoResult ? `Промокод: ${promoResult.code} (${promoResult.status})` : ''].filter(Boolean).join('\n'),
    });

    // 2) Клиенту сразу отвечаем «принято» (форма не ждёт почту)
    res.json({ ok: true });

    // 3) Письмо — в фоне, best-effort (SMTP может быть недоступен у хостинга)
    sendBookingMail(data).catch((e) => console.error('Mail send failed:', e.message));
    // 4) Клиенту — автоответ «заявка получена»
    sendBookingConfirmation({ name: data.name, email: data.email, lang }).catch((e) =>
      console.error('Confirmation mail failed:', e.message)
    );
  } catch (err) {
    console.error('Booking error:', err);
    if (!res.headersSent)
      res.status(500).json({ ok: false, error: 'Не удалось отправить. Попробуйте позже.' });
  }
});

// ── Покупка гайда ──
const shopLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// Какие способы покупки доступны (для кнопок на сайте)
app.get('/api/shop/config', (req, res) => {
  if (gr.enabled) {
    return res.json({ provider: 'gumroad', products: { pdf: gumroad.productAvailable(gr, 'pdf'), web: gumroad.productAvailable(gr, 'web') } });
  }
  const on = Boolean(lemon.enabled || stripe);
  res.json({ provider: lemon.enabled ? 'lemonsqueezy' : stripe ? 'stripe' : null, products: { pdf: on, web: on } });
});

app.post('/api/checkout', shopLimiter, async (req, res) => {
  if (gr.enabled) {
    const r = gumroad.checkoutUrl({ cfg: gr, product: req.body?.product });
    if (r.ok) return res.json({ ok: true, url: r.url, ref: r.ref, provider: 'gumroad' });
    return res.status(404).json({ ok: false, error: 'Этот вариант гайда сейчас недоступен' });
  }
  if (lemon.enabled) {
    const r = await createCheckout({ cfg: lemon, siteUrl: SITE_URL, product: req.body?.product }, { fetchJson });
    if (r.ok) return res.json({ ok: true, url: r.url });
    console.error('Lemon Squeezy checkout error:', r.error, r.detail || '');
    return res.status(500).json({ ok: false, error: 'Не удалось открыть оплату. Попробуйте позже.' });
  }
  if (!stripe) return res.status(503).json({ ok: false, error: 'Оплата временно недоступна' });
  try {
    const product = productOf(req.body?.product);
    const web = product === 'web';
    const params = checkoutParams({
      siteUrl: SITE_URL,
      product,
      priceId: web ? process.env.STRIPE_WEB_PRICE_ID : process.env.STRIPE_PRICE_ID,
      amount: web ? Number(process.env.GUIDE_WEB_PRICE_CENTS) || undefined : undefined,
      lang: req.body?.lang,
    });
    const session = await stripe.checkout.sessions.create(params);
    res.json({ ok: true, url: session.url });
  } catch (e) {
    console.error('Checkout error:', e.message);
    res.status(500).json({ ok: false, error: 'Не удалось открыть оплату. Попробуйте позже.' });
  }
});

// Страница доступа: по session_id (сразу после оплаты) или token (ссылка из письма)
app.get('/api/guide/access', shopLimiter, async (req, res) => {
  const { session_id, token, ref } = req.query;
  const result = token
    ? accessByToken(String(token), shopDeps)
    : ref
      ? accessByRef(String(ref))
      : stripe
      ? await accessBySession(String(session_id || ''), shopDeps)
      : { ok: false, error: 'not_found' };

  if (!result.ok) {
    const status = result.error === 'bad_request' ? 400 : result.error === 'not_paid' ? 402 : 404;
    return res.status(status).json({ ok: false, error: result.error });
  }
  const { order } = result;
  res.json({
    ok: true,
    product: productOf(order.product),
    promo: order.promo_code || null,
    email: maskEmail(order.email),
    url: accessUrl(order),
    downloadUrl: accessUrl(order),
  });
});

// Lemon Squeezy: заказ создаёт вебхук; пока он не пришёл — 402 (страница ждёт и повторяет)
function accessByRef(ref) {
  if (!isValidRef(ref) && !gumroad.isValidRef(ref)) return { ok: false, error: 'bad_request' };
  const order = db.getOrderBySession(ref);
  return order ? { ok: true, order } : { ok: false, error: 'not_paid' };
}

// Gumroad: разблокировка по лицензионному ключу из чека (если письмо не дошло)
const licenseLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
app.post('/api/guide/license', licenseLimiter, async (req, res) => {
  if (!gr.enabled) return res.status(503).json({ ok: false, error: 'unavailable' });
  const deps = { fetchJson };
  const lic = await gumroad.licenseToSale(String(req.body?.key || ''), { cfg: gr }, deps);
  if (!lic.ok) return res.status(lic.error === 'network' ? 502 : 404).json({ ok: false, error: lic.error });

  let order = db.getOrderByExtSale(String(lic.saleId));
  if (!order) {
    const fetched = await gumroad.fetchSale(String(lic.saleId), { cfg: gr }, deps);
    const mapped = fetched.ok ? gumroad.saleToSession(fetched.sale, gr) : fetched;
    if (!mapped.ok) return res.status(404).json({ ok: false, error: mapped.error });
    const result = await fulfillSession(mapped.session, shopDeps);
    if (!result.ok) return res.status(result.error === 'not_paid' ? 402 : 500).json({ ok: false, error: result.error });
    order = result.order;
  }
  res.json({ ok: true, token: order.token });
});

app.get('/api/guide/download', shopLimiter, (req, res) => {
  const result = accessByToken(String(req.query.token || ''), shopDeps, 'pdf');
  if (!result.ok) return res.status(result.error === 'bad_request' ? 400 : 404).send('Ссылка недействительна');
  if (!existsSync(GUIDE_PDF)) {
    console.error('Guide PDF not found at', GUIDE_PDF);
    return res.status(500).send('Файл временно недоступен');
  }
  db.countDownload(result.order.id);
  res.download(GUIDE_PDF, 'Гайд-трихолога.pdf');
});

// Онлайн-версия гайда: закрытая страница, только по личной ссылке покупателя.
// Файл лежит вне веб-корня; поисковикам запрещено индексировать, ссылка не утекает в Referer.
app.get('/api/guide/online', shopLimiter, (req, res) => {
  res.set({
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'private, no-store',
  });
  const result = accessByToken(String(req.query.token || ''), shopDeps, 'web');
  if (!result.ok) return res.status(result.error === 'bad_request' ? 400 : 404).send('Ссылка недействительна');
  if (!existsSync(GUIDE_WEB)) {
    console.error('Online guide not found at', GUIDE_WEB);
    return res.status(500).send('Гайд временно недоступен');
  }
  db.countDownload(result.order.id);
  // Подставляем личный промокод покупателя в блок <!--PROMO-->…<!--/PROMO-->
  const html = readFileSync(GUIDE_WEB, 'utf8');
  const code = result.order.promo_code;
  res.type('html').send(
    html.replace(/<!--PROMO-->([\s\S]*?)<!--\/PROMO-->/g, (_, block) =>
      code ? block.replaceAll('{{PROMO}}', code.replace(/[^A-Z0-9-]/g, '')) : ''
    )
  );
});

// Кнопка «Отправить врачу» в онлайн-гайде: итог анкеты уходит на почту врача.
// Только для покупателей онлайн-версии (по их токену), не чаще 5 раз за 10 минут.
const shareLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
app.post('/api/guide/share', shareLimiter, async (req, res) => {
  const result = accessByToken(String(req.body?.token || ''), shopDeps, 'web');
  if (!result.ok) return res.status(result.error === 'bad_request' ? 400 : 404).json({ ok: false, error: result.error });
  const text = String(req.body?.text || '').trim().slice(0, 5000);
  if (!text) return res.status(400).json({ ok: false, error: 'empty' });
  try {
    await sendGuideResults({ buyerEmail: result.order.email, text });
    res.json({ ok: true });
  } catch (e) {
    console.error('Guide results mail failed:', e.message);
    res.status(502).json({ ok: false, error: 'mail_failed' });
  }
});

// ── Счётчик посещений ──
const trackLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: false, legacyHeaders: false });

function deriveSource(ref) {
  if (!ref) return 'Прямой заход';
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '');
    if (/instagram|ig\.me|l\.instagram/.test(host)) return 'Instagram';
    if (/google\./.test(host)) return 'Google';
    if (/yandex\./.test(host)) return 'Yandex';
    if (/t\.me|telegram/.test(host)) return 'Telegram';
    if (/facebook|fb\.com/.test(host)) return 'Facebook';
    if (host.includes('nadezdantiage')) return 'Прямой заход';
    return host;
  } catch { return 'Прямой заход'; }
}

app.post('/api/track', trackLimiter, (req, res) => {
  try {
    const ua = req.headers['user-agent'] || '';
    // не считаем ботов/краулеров
    if (/bot|crawl|spider|slurp|preview|monitor|curl|wget|headless/i.test(ua)) return res.json({ ok: true });
    const { path, referrer } = req.body || {};
    const device = /mobile|android|iphone|ipad|ipod/i.test(ua) ? 'Мобильный' : 'Компьютер';
    saveVisit({
      path: String(path || '/').slice(0, 200),
      referrer: String(referrer || '').slice(0, 300),
      source: deriveSource(referrer),
      device,
      ip: req.ip,
    });
  } catch (e) { /* тихо игнорируем — счётчик не должен мешать сайту */ }
  res.json({ ok: true });
});

// ── Админ-панель ──
function adminAuth(req, res, next) {
  const pass =
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.key || '';
  if (process.env.ADMIN_PASSWORD && pass === process.env.ADMIN_PASSWORD) return next();
  res.status(401).json({ ok: false, error: 'Неверный пароль' });
}

app.get('/api/admin/stats', adminAuth, (_req, res) => res.json({ ok: true, stats: getStats() }));
app.get('/api/admin/bookings', adminAuth, (_req, res) => res.json({ ok: true, bookings: getBookings() }));
app.get('/api/admin/orders', adminAuth, (_req, res) => res.json({ ok: true, orders: db.getOrders() }));

// страница админки (nginx проксирует /admin сюда)
app.get('/admin', (_req, res) => res.sendFile(join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log(`✓ API запущен на порту ${PORT}`);
});
