import { useEffect, useRef, useState } from 'react';

// Появление элемента при попадании в зону видимости (замена IntersectionObserver-кода)
// Использование: const [ref, shown] = useReveal();  <div ref={ref} className={shown ? 'in' : ''}>
export default function useReveal({ threshold = 0.14, once = true } = {}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          if (once) io.unobserve(el);
        } else if (!once) {
          setShown(false);
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);

  return [ref, shown];
}
