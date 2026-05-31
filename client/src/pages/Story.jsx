import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import bodyHtml from '../legacy/story-body.html?raw';
import { initStory } from '../legacy/story-script.js';
import '../legacy/story.css';

// Страница истории: разметка и стили перенесены 1:1 из story.html,
// вся интерактивность (loader, scroll-движок, анимации) — в initStory().
export default function Story() {
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const cleanup = initStory();
    return cleanup;
  }, []);

  // Перехват SPA-ссылок (назад на главную) — без перезагрузки
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
