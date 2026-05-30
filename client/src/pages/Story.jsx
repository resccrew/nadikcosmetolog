import { Link } from 'react-router-dom';

// ⚠️ Каркас-заглушка. На следующем этапе сюда переносится полный story.html
// (hero, tagline, timeline, направления, цитата, CTA) как React-секции.
export default function Story() {
  return (
    <main style={{ padding: '120px 8vw', textAlign: 'center' }}>
      <h1
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 300,
          fontSize: 'clamp(2.5rem, 6vw, 5rem)',
          marginBottom: 24,
        }}
      >
        История <em>врача</em>
      </h1>
      <p style={{ color: 'rgba(248,244,239,0.5)', marginBottom: 32 }}>
        Страница загружается отдельным чанком (lazy) — проверка роутинга.
      </p>
      <Link to="/" className="btn-primary">
        На главную
      </Link>
    </main>
  );
}
