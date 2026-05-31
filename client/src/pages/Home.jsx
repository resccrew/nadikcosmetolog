import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import bodyHtml from '../legacy/home-body.html?raw';
import { initHome } from '../legacy/home-script.js';
import '../legacy/home.css';

// Главная страница: разметка и стили перенесены 1:1 из index.html,
// вся интерактивность — в initHome() (drawer, lightbox, меню, форма записи → бэкенд).
export default function Home() {
  const ref = useRef(null);
  const navigate = useNavigate();

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

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: bodyHtml }} />;
}
