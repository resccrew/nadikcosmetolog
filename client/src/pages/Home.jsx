import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import bodyRu from '../legacy/home-body.html?raw';
import bodyEn from '../legacy/home-body.en.html?raw';
import { initHome } from '../legacy/home-script.js';
import { getLang } from '../lib/lang.js';
import { startCheckout } from '../lib/api.js';
import '../legacy/home.css';

// Главная страница: разметка и стили перенесены 1:1 из index.html,
// вся интерактивность — в initHome() (drawer, lightbox, меню, форма записи → бэкенд).
// Язык (RU/EN) выбирает нужную версию разметки.
export default function Home() {
  const ref = useRef(null);
  const navigate = useNavigate();
  const bodyHtml = getLang() === 'en' ? bodyEn : bodyRu;

  useEffect(() => {
    const cleanup = initHome();
    return cleanup;
  }, []);

  // Перехват SPA-ссылок (на /story) — переход без перезагрузки
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const handler = (e) => {
      const a = e.target.closest('a[data-spa]');
      if (!a) return;
      e.preventDefault();
      navigate(a.getAttribute('href'));
    };
    root.addEventListener('click', handler);
    return () => root.removeEventListener('click', handler);
  }, [navigate]);

  // Кнопки [data-checkout] → создаём Stripe Checkout и уходим на оплату
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
      const res = await startCheckout(getLang());
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
  }, []);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: bodyHtml }} />;
}
