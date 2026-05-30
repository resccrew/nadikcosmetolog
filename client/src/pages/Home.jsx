import { Link } from 'react-router-dom';
import BookingForm from '../components/BookingForm.jsx';

// ⚠️ Каркас-заглушка. На следующем этапе сюда переносится полный дизайн index.html
// (hero, about, услуги, философия, отзывы, баннер истории) как React-секции.
export default function Home() {
  return (
    <main>
      <section style={{ padding: '120px 8vw 80px', textAlign: 'center' }}>
        <p style={{ color: 'var(--gold)', letterSpacing: '0.3em', fontSize: '0.7rem', textTransform: 'uppercase' }}>
          Каркас готов
        </p>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            fontSize: 'clamp(2.5rem, 6vw, 5rem)',
            margin: '20px 0',
          }}
        >
          Надежда <em>Праворова</em>
        </h1>
        <Link to="/story" className="btn-primary">
          Открыть историю
        </Link>
      </section>

      <section style={{ padding: '40px 8vw 120px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 300,
              fontSize: '2rem',
              marginBottom: 24,
              textAlign: 'center',
            }}
          >
            Запись на <em>консультацию</em>
          </h2>
          <BookingForm />
        </div>
      </section>
    </main>
  );
}
