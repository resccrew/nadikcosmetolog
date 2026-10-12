import { useEffect } from 'react';
import { getLang } from '../lib/lang.js';
import { startCheckout, getGuideAccess } from '../lib/api.js';

// Gumroad: окно оплаты поверх сайта открывает их скрипт по клику на ссылку товара
let gumroadScript;
function loadGumroad() {
  gumroadScript ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://gumroad.com/js/gumroad.js';
    s.onload = resolve;
    s.onerror = resolve; // без скрипта ссылка просто откроет Gumroad в этой вкладке
    document.head.appendChild(s);
  });
  return gumroadScript;
}

// Пока открыто окно Gumroad, ждём подтверждения оплаты (Ping) и ведём на страницу гайда
function waitForGumroad(ref) {
  const until = Date.now() + 20 * 60 * 1000;
  const tick = async () => {
    const res = await getGuideAccess({ ref });
    if (res.ok) return window.location.assign(`/guide/access?ref=${encodeURIComponent(ref)}`);
    if (Date.now() < until) setTimeout(tick, 3000);
  };
  setTimeout(tick, 5000);
}

async function openGumroad(url, ref) {
  await loadGumroad();
  const a = document.createElement('a');
  a.href = url;
  a.className = 'gumroad-button';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  waitForGumroad(ref);
}

// Кнопки [data-checkout] внутри ref → создаём оплату (Gumroad поверх сайта или страница Stripe)
export function useCheckout(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let busy = false;
    const handler = async (e) => {
      const btn = e.target.closest('[data-checkout]');
      if (!btn) return;
      e.preventDefault();
      if (busy) return;
      busy = true;
      const errEl = root.querySelector('[data-checkout-error]');
      const buttons = root.querySelectorAll('button[data-checkout]');
      if (errEl) errEl.hidden = true;
      buttons.forEach((b) => (b.disabled = true));
      const res = await startCheckout(getLang(), btn.dataset.checkout === 'web' ? 'web' : 'pdf');
      if (res.ok && res.provider === 'gumroad') {
        await openGumroad(res.url, res.ref);
        busy = false;
        buttons.forEach((b) => (b.disabled = false));
        return;
      }
      if (res.ok && res.url) {
        window.location.href = res.url;
        return;
      }
      busy = false;
      buttons.forEach((b) => (b.disabled = false));
      // Оплата на сайте не настроена — отправляем на Gumroad, чтобы покупка не терялась
      const gumroad = root.querySelector('.guide-alt');
      if (res.status === 503 && gumroad) {
        window.location.href = gumroad.href;
        return;
      }
      if (errEl) errEl.hidden = false;
    };
    root.addEventListener('click', handler);
    return () => root.removeEventListener('click', handler);
  }, [ref]);
}
