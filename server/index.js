import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { sendBookingMail } from './mailer.js';

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

    // ── Валидация ──
    const errors = {};
    if (!name || String(name).trim().length < 2) errors.name = 'Укажите имя';
    if (!phone || String(phone).replace(/\D/g, '').length < 7)
      errors.phone = 'Укажите корректный телефон';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)))
      errors.email = 'Некорректный email';
    if (Object.keys(errors).length)
      return res.status(400).json({ ok: false, errors });

    await sendBookingMail({
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: email ? String(email).trim() : '',
      message: message ? String(message).trim() : '',
      ip: req.ip,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ ok: false, error: 'Не удалось отправить. Попробуйте позже.' });
  }
});

app.listen(PORT, () => {
  console.log(`✓ API запущен на порту ${PORT}`);
});
