import nodemailer from 'nodemailer';
import { readFile } from 'fs/promises';

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  // В тестах письма не отправляются, а возвращаются как JSON
  if (process.env.MAIL_JSON_TRANSPORT === 'true')
    return (transporter = nodemailer.createTransport({ jsonTransport: true }));
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // быстрый отказ, если SMTP недоступен (иначе запрос висит минутами)
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
  return transporter;
}

// Resend шлёт письма по HTTPS (порт 443) — хостинг блокирует SMTP-порты,
// поэтому на проде используем его API. Без RESEND_API_KEY — обычный SMTP.
async function sendViaResend({ from, to, replyTo, subject, text, html, attachments = [] }) {
  const files = await Promise.all(
    attachments.map(async (a) => ({ filename: a.filename, content: (await readFile(a.path)).toString('base64') }))
  );
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], reply_to: replyTo || undefined, subject, text, html, attachments: files }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

function sendMail(msg) {
  if (process.env.RESEND_API_KEY && process.env.MAIL_JSON_TRANSPORT !== 'true') return sendViaResend(msg);
  return getTransporter().sendMail(msg);
}

const esc = (s = '') =>
  String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

export async function sendBookingMail({ name, phone, email, message, ip }) {
  const to = process.env.MAIL_TO;
  if (!to) throw new Error('MAIL_TO не задан в .env');

  const when = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Warsaw' });

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;overflow:hidden">
    <div style="background:#1C1816;color:#D4B483;padding:20px 24px;font-size:18px">
      Новая заявка с сайта
    </div>
    <div style="padding:24px;color:#2E2924;font-size:15px;line-height:1.7">
      <p><b>Имя:</b> ${esc(name)}</p>
      ${phone ? `<p><b>Телефон:</b> <a href="tel:${esc(phone)}">${esc(phone)}</a></p>` : ''}
      <p><b>Email:</b> <a href="mailto:${esc(email)}">${esc(email)}</a></p>
      ${message ? `<p><b>Запрос:</b><br>${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="color:#999;font-size:12px">Отправлено: ${when} · IP: ${esc(ip || '')}</p>
    </div>
  </div>`;

  const text = [
    'Новая заявка с сайта',
    `Имя: ${name}`,
    phone ? `Телефон: ${phone}` : null,
    `Email: ${email}`,
    message ? `Запрос: ${message}` : null,
    `Отправлено: ${when}`,
  ]
    .filter(Boolean)
    .join('\n');

  await sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    replyTo: email,
    subject: `Заявка с сайта — ${name}`,
    text,
    html,
  });
}

// ── Письмо покупателю гайда: PDF во вложении + ссылка на страницу доступа ──
export async function sendGuideMail({ email, token, pdfPath, siteUrl }) {
  const link = `${siteUrl}/guide/access?token=${encodeURIComponent(token)}`;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;overflow:hidden">
    <div style="background:#1C1816;color:#D4B483;padding:20px 24px;font-size:18px">
      Спасибо за покупку!
    </div>
    <div style="padding:24px;color:#2E2924;font-size:15px;line-height:1.7">
      <p>Гайд «Самостоятельная консультация трихолога» — во вложении к этому письму (PDF).</p>
      <p>Скачать его ещё раз можно в любой момент по вашей личной ссылке:</p>
      <p><a href="${esc(link)}" style="display:inline-block;background:#1C1816;color:#D4B483;padding:12px 22px;border-radius:4px;text-decoration:none">Открыть гайд</a></p>
      <p style="color:#999;font-size:12px">Не пересылайте эту ссылку — она привязана к вашему заказу.</p>
    </div>
  </div>`;

  const text = [
    'Спасибо за покупку!',
    'Гайд «Самостоятельная консультация трихолога» — во вложении (PDF).',
    `Скачать ещё раз: ${link}`,
  ].join('\n');

  await sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Ваш гайд трихолога (PDF)',
    text,
    html,
    attachments: [{ filename: 'Гайд-трихолога.pdf', path: pdfPath }],
  });
}

// ── Автоответ клиенту после заявки ──
const CONFIRM = {
  ru: {
    subject: 'Ваша заявка получена',
    hello: (n) => `Здравствуйте, ${n}!`,
    body: [
      'Спасибо за вашу заявку на консультацию — я её получила.',
      'Свяжусь с вами в ближайшее время, чтобы уточнить детали и подобрать удобное время.',
    ],
    sign: 'С уважением,<br>Надежда Праворова',
    signText: 'С уважением,\nНадежда Праворова',
    note: 'Это письмо отправлено автоматически, отвечать на него не нужно.',
  },
  en: {
    subject: 'Your request has been received',
    hello: (n) => `Hello, ${n}!`,
    body: [
      'Thank you for your consultation request — I have received it.',
      'I will get back to you shortly to clarify the details and find a convenient time.',
    ],
    sign: 'Kind regards,<br>Nadezda Pravorova',
    signText: 'Kind regards,\nNadezda Pravorova',
    note: 'This is an automatic message, no need to reply.',
  },
};

export async function sendBookingConfirmation({ name, email, lang }) {
  const t = CONFIRM[lang === 'en' ? 'en' : 'ru'];

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;overflow:hidden">
    <div style="background:#1C1816;color:#D4B483;padding:20px 24px;font-size:18px">
      ${t.subject}
    </div>
    <div style="padding:24px;color:#2E2924;font-size:15px;line-height:1.7">
      <p>${esc(t.hello(name))}</p>
      ${t.body.map((p) => `<p>${p}</p>`).join('')}
      <p>${t.sign}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="color:#999;font-size:12px">${t.note}</p>
    </div>
  </div>`;

  const text = [t.hello(name), '', ...t.body, '', t.signText].join('\n');

  return sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    replyTo: process.env.MAIL_TO || undefined,
    subject: t.subject,
    text,
    html,
  });
}
