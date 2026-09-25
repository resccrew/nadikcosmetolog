import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// При переходе на новую страницу — скроллим наверх и считаем посещение
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    // тихий счётчик посещений для админ-панели (ошибки не мешают сайту)
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ path: pathname, referrer: document.referrer }),
    }).catch(() => {});
  }, [pathname]);
  return null;
}
