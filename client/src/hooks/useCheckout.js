import { useEffect } from 'react';
import { getLang } from '../lib/lang.js';
import { startCheckout } from '../lib/api.js';

// Кнопки [data-checkout] внутри ref → создаём Stripe Checkout и уходим на оплату
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
