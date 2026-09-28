// База API. В разработке Vite проксирует /api на localhost:3001.
// На проде nginx проксирует /api на Node-сервер — поэтому путь относительный.
const BASE = import.meta.env.VITE_API_URL || '';

export async function submitBooking(data) {
  const res = await fetch(`${BASE}/api/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* пустой ответ */
  }
  if (!res.ok) {
    return { ok: false, errors: body.errors, error: body.error || 'Ошибка отправки' };
  }
  return body;
}

// ── Покупка гайда через Stripe ──
async function getJson(url, opts) {
  try {
    const res = await fetch(`${BASE}${url}`, opts);
    const body = await res.json().catch(() => ({}));
    return res.ok ? body : { ok: false, error: body.error || 'error', status: res.status };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export const startCheckout = (lang) =>
  getJson('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang }),
  });

export const getGuideAccess = (params) =>
  getJson(`/api/guide/access?${new URLSearchParams(params)}`);
