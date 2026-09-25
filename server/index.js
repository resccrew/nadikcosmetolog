import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendBookingMail } from './mailer.js';
import { saveBooking, saveVisit, getBookings, getStats } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1); // за nginx — чтобы rate-limit видел реальный IP
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
    const { name, phone, email, message, _honey } = req.body || {};

    // honeypot: если бот заполнил скрытое поле — молча отвечаем «ок»
    if (_honey) return res.json({ ok: true });

    // ── Валидация: имя и email обязательны ──
    const errors = {};
    if (!name || String(name).trim().length < 2) errors.name = 'Укажите имя';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) errors.email = 'Укажите корректный email';
    if (Object.keys(errors).length)
      return res.status(400).json({ ok: false, errors });

    const data = {
      name: String(name).trim(),
      phone: phone ? String(phone).trim() : '',
      email: String(email).trim(),
      message: message ? String(message).trim() : '',
      ip: req.ip,
    };

    // 1) СНАЧАЛА сохраняем заявку в базу — она не потеряется, даже если письмо не уйдёт
    saveBooking(data);

    // 2) Клиенту сразу отвечаем «принято» (форма не ждёт почту)
    res.json({ ok: true });

    // 3) Письмо — в фоне, best-effort (SMTP может быть недоступен у хостинга)
    sendBookingMail(data).catch((e) => console.error('Mail send failed:', e.message));
  } catch (err) {
    console.error('Booking error:', err);
    if (!res.headersSent)
      res.status(500).json({ ok: false, error: 'Не удалось отправить. Попробуйте позже.' });
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

// страница админки (nginx проксирует /admin сюда)
app.get('/admin', (_req, res) => res.sendFile(join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log(`✓ API запущен на порту ${PORT}`);
});
