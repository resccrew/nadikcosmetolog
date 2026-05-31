import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import bodyHtml from '../legacy/story-body.html?raw';
import { initStory } from '../legacy/story-script.js';
import storyCssUrl from '../legacy/story.css?url';

// Страница истории: разметка 1:1 из story.html.
// CSS грузится динамически (<link>) и удаляется при уходе —
// чтобы стили story не конфликтовали со стилями главной.
export default function Story() {
  const ref = useRef(null);
  const navigate = useNavigate();

  // Динамический CSS: добавляем при монтировании, удаляем при размонтировании
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = storyCssUrl;
    document.head.appendChild(link);

    // Восстанавливаем курсор (home.css скрывает его глобально через cursor:none)
    const cursorFix = document.createElement('style');
    cursorFix.textContent = '* { cursor: auto !important }';
    cursorFix.id = 'story-cursor-fix';
    document.head.appendChild(cursorFix);

    return () => {
      document.head.removeChild(link);
      const fix = document.getElementById('story-cursor-fix');
      if (fix) document.head.removeChild(fix);
    };
  }, []);

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
