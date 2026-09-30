import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getGuideAccess } from '../lib/api.js';
import { getLang } from '../lib/lang.js';

const T = {
  ru: {
    loading: 'Проверяем оплату…',
    title: 'Спасибо за покупку!',
    text: (email) =>
      email ? `Гайд отправлен на ${email}. Скачать его можно и прямо здесь:` : 'Скачать гайд можно прямо здесь:',
    download: 'Скачать гайд (PDF)',
    keep: 'Сохраните ссылку из письма — по ней гайд доступен в любой момент.',
    pending: 'Оплата ещё обрабатывается. Обновите страницу через минуту.',
    failTitle: 'Доступ не найден',
    fail: 'Ссылка недействительна или оплата не прошла. Если вы оплатили — напишите нам, и мы вышлем гайд.',
    retry: 'Обновить',
    home: 'На главную',
  },
  en: {
    loading: 'Checking your payment…',
    title: 'Thank you for your purchase!',
    text: (email) =>
      email ? `The guide was sent to ${email}. You can also download it here:` : 'You can download the guide here:',
    download: 'Download the guide (PDF)',
    keep: 'Keep the link from the email — it gives you access any time.',
    pending: 'Your payment is still processing. Refresh in a minute.',
    failTitle: 'Access not found',
    fail: 'The link is invalid or the payment did not go through. If you paid, contact us and we will send the guide.',
    retry: 'Refresh',
    home: 'Home',
  },
};

// Страница после оплаты (?session_id=) и по ссылке из письма (?token=)
export default function GuideAccess() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: 'loading' });
  const t = T[getLang()];

  useEffect(() => {
    const token = params.get('token');
    const sessionId = params.get('session_id');
    if (!token && !sessionId) {
      setState({ status: 'fail' });
      return;
    }
    getGuideAccess(token ? { token } : { session_id: sessionId }).then((res) => {
      if (res.ok) return setState({ status: 'ok', ...res });
      setState({ status: res.status === 402 ? 'pending' : 'fail' });
    });
  }, [params]);

  return (
    <main style={S.page}>
      <div style={S.card}>
        {state.status === 'loading' && <p style={S.text}>{t.loading}</p>}
        {state.status === 'ok' && (
          <>
            <h1 style={S.title}>{t.title}</h1>
            <p style={S.text}>{t.text(state.email)}</p>
            <a href={state.downloadUrl} style={S.btn} download>
              {t.download}
            </a>
            <p style={S.note}>{t.keep}</p>
          </>
        )}
        {state.status === 'pending' && (
          <>
            <h1 style={S.title}>{t.loading}</h1>
            <p style={S.text}>{t.pending}</p>
            <button style={S.btn} onClick={() => window.location.reload()}>
              {t.retry}
            </button>
          </>
        )}
        {state.status === 'fail' && (
          <>
            <h1 style={S.title}>{t.failTitle}</h1>
            <p style={S.text}>{t.fail}</p>
          </>
        )}
        <Link to="/" style={S.home}>
          ← {t.home}
        </Link>
      </div>
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
  text: { fontSize: '0.95rem', lineHeight: 1.7, color: '#7A6E64', margin: '0 0 28px' },
  btn: {
    display: 'inline-block', padding: '16px 34px', background: '#1C1816', color: '#F8F4EF',
    textDecoration: 'none', fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase',
    borderRadius: 3, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  },
  note: { fontSize: '0.75rem', color: '#7A6E64', margin: '24px 0 0', lineHeight: 1.6 },
  home: {
    display: 'inline-block', marginTop: 32, fontSize: '0.7rem', letterSpacing: '0.16em',
    textTransform: 'uppercase', color: '#B8965A', textDecoration: 'none',
  },
};
