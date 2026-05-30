import nodemailer from 'nodemailer';

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

const esc = (s = '') =>
  String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

export async function sendBookingMail({ name, phone, email, message, ip }) {
  const to = process.env.MAIL_TO;
  if (!to) throw new Error('MAIL_TO не задан в .env');

  const when = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;overflow:hidden">
    <div style="background:#1C1816;color:#D4B483;padding:20px 24px;font-size:18px">
      Новая заявка с сайта
    </div>
    <div style="padding:24px;color:#2E2924;font-size:15px;line-height:1.7">
      <p><b>Имя:</b> ${esc(name)}</p>
      <p><b>Телефон:</b> <a href="tel:${esc(phone)}">${esc(phone)}</a></p>
      ${email ? `<p><b>Email:</b> <a href="mailto:${esc(email)}">${esc(email)}</a></p>` : ''}
      ${message ? `<p><b>Запрос:</b><br>${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="color:#999;font-size:12px">Отправлено: ${when} · IP: ${esc(ip || '')}</p>
    </div>
  </div>`;

  const text = [
    'Новая заявка с сайта',
    `Имя: ${name}`,
    `Телефон: ${phone}`,
    email ? `Email: ${email}` : null,
    message ? `Запрос: ${message}` : null,
    `Отправлено: ${when}`,
  ]
    .filter(Boolean)
    .join('\n');

  await getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    replyTo: email || undefined,
    subject: `Заявка с сайта — ${name}`,
    text,
    html,
  });
}
