// Лёгкая база SQLite: хранит заявки и посещения для админ-панели.
// Используем встроенный в Node модуль node:sqlite — без внешних пакетов и компиляции.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || join(__dirname, 'data.sqlite'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, phone TEXT, email TEXT, message TEXT,
    ip TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT, referrer TEXT, source TEXT, device TEXT,
    ip TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE,
    email TEXT,
    amount INTEGER, currency TEXT,
    token TEXT UNIQUE,
    downloads INTEGER DEFAULT 0,
    emailed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at);
  CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at);
`);

// ── Запись ──
export function saveBooking(b) {
  db.prepare(
    'INSERT INTO bookings (name, phone, email, message, ip) VALUES (?,?,?,?,?)'
  ).run(b.name || '', b.phone || '', b.email || '', b.message || '', b.ip || '');
}

export function saveVisit(v) {
  db.prepare(
    'INSERT INTO visits (path, referrer, source, device, ip) VALUES (?,?,?,?,?)'
  ).run(v.path || '/', v.referrer || '', v.source || '', v.device || '', v.ip || '');
}

// ── Заказы гайда (Stripe) ──
// INSERT OR IGNORE: повторный вебхук с тем же session_id не создаст дубль
export function createOrder(o) {
  const r = db.prepare(
    'INSERT OR IGNORE INTO orders (session_id, email, amount, currency, token) VALUES (?,?,?,?,?)'
  ).run(o.sessionId, o.email || '', o.amount || 0, o.currency || '', o.token);
  return r.changes > 0;
}

export const getOrderBySession = (sessionId) =>
  db.prepare('SELECT * FROM orders WHERE session_id = ?').get(sessionId);

export const getOrderByToken = (token) =>
  db.prepare('SELECT * FROM orders WHERE token = ?').get(token);

// Атомарно «забираем» отправку письма: true только у одного из параллельных вызовов
export function claimOrderEmail(id) {
  return db.prepare('UPDATE orders SET emailed = 1 WHERE id = ? AND emailed = 0').run(id).changes > 0;
}

export function releaseOrderEmail(id) {
  db.prepare('UPDATE orders SET emailed = 0 WHERE id = ?').run(id);
}

export function countDownload(id) {
  db.prepare('UPDATE orders SET downloads = downloads + 1 WHERE id = ?').run(id);
}

export function getOrders(limit = 300) {
  return db.prepare('SELECT id, email, amount, currency, downloads, emailed, created_at FROM orders ORDER BY id DESC LIMIT ?').all(limit);
}

// ── Чтение для админки ──
export function getBookings(limit = 300) {
  return db.prepare('SELECT * FROM bookings ORDER BY id DESC LIMIT ?').all(limit);
}

const one = (sql, ...args) => db.prepare(sql).get(...args);
const many = (sql, ...args) => db.prepare(sql).all(...args);

export function getStats() {
  const visitsTotal = one('SELECT COUNT(*) c FROM visits').c;
  const visitsToday = one("SELECT COUNT(*) c FROM visits WHERE date(created_at)=date('now')").c;
  const visitsWeek = one("SELECT COUNT(*) c FROM visits WHERE created_at>=datetime('now','-7 days')").c;
  const visitsMonth = one("SELECT COUNT(*) c FROM visits WHERE created_at>=datetime('now','-30 days')").c;
  const uniqTotal = one('SELECT COUNT(DISTINCT ip) c FROM visits').c;
  const uniqToday = one("SELECT COUNT(DISTINCT ip) c FROM visits WHERE date(created_at)=date('now')").c;
  const uniqWeek = one("SELECT COUNT(DISTINCT ip) c FROM visits WHERE created_at>=datetime('now','-7 days')").c;
  const uniqMonth = one("SELECT COUNT(DISTINCT ip) c FROM visits WHERE created_at>=datetime('now','-30 days')").c;

  const bookingsTotal = one('SELECT COUNT(*) c FROM bookings').c;
  const bookingsToday = one("SELECT COUNT(*) c FROM bookings WHERE date(created_at)=date('now')").c;
  const bookingsWeek = one("SELECT COUNT(*) c FROM bookings WHERE created_at>=datetime('now','-7 days')").c;
  const bookingsMonth = one("SELECT COUNT(*) c FROM bookings WHERE created_at>=datetime('now','-30 days')").c;

  // посещения по дням за 30 дней
  const visitsByDay = many(`
    SELECT date(created_at) d, COUNT(*) c, COUNT(DISTINCT ip) u
    FROM visits WHERE created_at>=datetime('now','-30 days')
    GROUP BY d ORDER BY d`);
  // заявки по дням за 30 дней
  const bookingsByDay = many(`
    SELECT date(created_at) d, COUNT(*) c
    FROM bookings WHERE created_at>=datetime('now','-30 days')
    GROUP BY d ORDER BY d`);
  // источники
  const sources = many(`
    SELECT COALESCE(NULLIF(source,''),'Прямой заход') s, COUNT(*) c
    FROM visits GROUP BY s ORDER BY c DESC LIMIT 8`);
  // страницы
  const pages = many(`
    SELECT path p, COUNT(*) c FROM visits GROUP BY p ORDER BY c DESC LIMIT 8`);
  // устройства
  const devices = many(`
    SELECT COALESCE(NULLIF(device,''),'—') dv, COUNT(*) c
    FROM visits GROUP BY dv ORDER BY c DESC`);

  const conversion = uniqTotal ? Math.round((bookingsTotal / uniqTotal) * 1000) / 10 : 0;

  return {
    visits: { total: visitsTotal, today: visitsToday, week: visitsWeek, month: visitsMonth },
    unique: { total: uniqTotal, today: uniqToday, week: uniqWeek, month: uniqMonth },
    bookings: { total: bookingsTotal, today: bookingsToday, week: bookingsWeek, month: bookingsMonth },
    conversion,
    visitsByDay,
    bookingsByDay,
    sources,
    pages,
    devices,
  };
}

export default db;
