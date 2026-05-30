import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// При переходе на новую страницу — скроллим наверх
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
