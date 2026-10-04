import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import bodyRu from '../legacy/home-body.html?raw';
import bodyEn from '../legacy/home-body.en.html?raw';
import { getLang, setLang } from '../lib/lang.js';
import { useCheckout } from '../hooks/useCheckout.js';
import '../legacy/home.css';

// Блок гайда берём из разметки главной — одна копия текста и цен на оба места
function guideSection(html) {
  const start = html.indexOf('<section class="guide');
  const end = html.indexOf('</section>', start) + '</section>'.length;
  return html.slice(start, end).replace('guide reveal', 'guide').replace('href="#guide"', 'href="#"');
}

const T = {
  ru: { home: 'Сайт врача', switchTo: 'EN', title: 'Гайд «Самостоятельная консультация трихолога» — Nadezda.antiage' },
  en: { home: 'Doctor’s website', switchTo: 'RU', title: 'Self-guided trichologist consultation guide — Nadezda.antiage' },
};

// Отдельная страница покупки гайда — прямая ссылка nadezdantiage.com/guide (?lang=en)
export default function Guide() {
  const ref = useRef(null);
  const [params] = useSearchParams();
  const q = params.get('lang');
  if (q === 'en' || q === 'ru') setLang(q);
  const lang = getLang();
  const t = T[lang];

  useCheckout(ref);

  useEffect(() => {
    document.documentElement.lang = lang;
    const prev = document.title;
    document.title = t.title;
    return () => {
      document.title = prev;
    };
  }, [lang, t.title]);

  const toggle = () => {
    setLang(lang === 'en' ? 'ru' : 'en');
    window.location.replace('/guide');
  };

  return (
    <div style={S.page}>
      <header style={S.header}>
        <Link to="/" className="nav-logo" style={S.logo}>
          Nadezda.<span>antiage</span>
        </Link>
        <div style={S.right}>
          <Link to="/" style={S.link}>{t.home}</Link>
          <button type="button" className="lang-toggle" onClick={toggle}>{t.switchTo}</button>
        </div>
      </header>
      <div ref={ref} dangerouslySetInnerHTML={{ __html: guideSection(lang === 'en' ? bodyEn : bodyRu) }} />
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: 'var(--cream, #F8F4EF)', cursor: 'auto' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    padding: '24px clamp(16px, 5vw, 60px)', borderBottom: '1px solid #EDE5D8',
  },
  logo: { position: 'static', textDecoration: 'none', color: '#1C1816' },
  right: { display: 'flex', alignItems: 'center', gap: 20 },
  link: {
    fontSize: '0.7rem', letterSpacing: '0.16em', textTransform: 'uppercase',
    color: '#B8965A', textDecoration: 'none', fontFamily: "'Jost', sans-serif",
  },
};
