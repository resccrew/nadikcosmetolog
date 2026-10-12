import { useState } from 'react';
import { Link } from 'react-router-dom';
import { unlockGuide } from '../lib/api.js';
import { getLang } from '../lib/lang.js';

const T = {
  ru: {
    title: 'Открыть гайд',
    text: 'Введите лицензионный ключ из чека Gumroad — он пришёл на почту после оплаты.',
    placeholder: 'XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX',
    submit: 'Открыть',
    busy: 'Проверяем…',
    notFound: 'Ключ не найден. Проверьте, что скопировали его целиком.',
    refunded: 'Покупка по этому ключу отменена.',
    error: 'Не удалось проверить ключ. Попробуйте через минуту.',
    home: 'На главную',
  },
  en: {
    title: 'Open the guide',
    text: 'Enter the license key from your Gumroad receipt — it was emailed to you after payment.',
    placeholder: 'XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX',
    submit: 'Open',
    busy: 'Checking…',
    notFound: 'Key not found. Make sure you copied all of it.',
    refunded: 'The purchase for this key was refunded.',
    error: 'Could not check the key. Please try again in a minute.',
    home: 'Home',
  },
};

// Запасной путь для покупок через Gumroad: ключ из чека → заказ → страница доступа
export default function GuideUnlock() {
  const t = T[getLang()];
  const [key, setKey] = useState('');
  const [state, setState] = useState({ status: 'idle' });

  const submit = async (e) => {
    e.preventDefault();
    if (!key.trim()) return;
    setState({ status: 'busy' });
    const res = await unlockGuide(key.trim());
    if (res.ok && res.token) return window.location.assign(`/guide/access?token=${encodeURIComponent(res.token)}`);
    const msg = res.status === 404 || res.status === 400 ? t.notFound : res.status === 402 ? t.refunded : t.error;
    setState({ status: 'error', msg });
  };

  return (
    <main style={S.page}>
      <form style={S.card} onSubmit={submit}>
        <h1 style={S.title}>{t.title}</h1>
        <p style={S.text}>{t.text}</p>
        <input
          style={S.input}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t.placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-label={t.title}
        />
        {state.status === 'error' && <p style={S.error}>{state.msg}</p>}
        <button type="submit" style={S.btn} disabled={state.status === 'busy'}>
          {state.status === 'busy' ? t.busy : t.submit}
        </button>
        <div>
          <Link to="/" style={S.home}>
            ← {t.home}
          </Link>
        </div>
      </form>
    </main>
  );
}

const S = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#F8F4EF', padding: '40px 16px', cursor: 'auto',
  },
  card: {
    maxWidth: 520, width: '100%', background: '#FDFAF6', border: '1px solid #EDE5D8',
    borderRadius: 6, padding: '48px 36px', textAlign: 'center', color: '#2E2924',
    fontFamily: "'Jost', sans-serif",
  },
  title: {
    fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: '2.2rem',
    color: '#1C1816', margin: '0 0 16px',
  },
  text: { fontSize: '0.95rem', lineHeight: 1.7, color: '#7A6E64', margin: '0 0 24px' },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '14px 16px', border: '1px solid #EDE5D8',
    borderRadius: 3, background: '#fff', fontFamily: 'monospace', fontSize: '0.85rem',
    color: '#1C1816', textAlign: 'center', marginBottom: 18,
  },
  error: { fontSize: '0.85rem', color: '#A04A3A', margin: '0 0 16px' },
  btn: {
    display: 'inline-block', padding: '16px 34px', background: '#1C1816', color: '#F8F4EF',
    fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase',
    borderRadius: 3, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  },
  home: {
    display: 'inline-block', marginTop: 32, fontSize: '0.7rem', letterSpacing: '0.16em',
    textTransform: 'uppercase', color: '#B8965A', textDecoration: 'none',
  },
};
