/* eslint-disable */
// Перенесено 1:1 из story.html. Вызывается из Story.jsx после монтирования.
export function initStory() {
  const cleanups = [];
  const timers = [];
  const on = (target, ev, fn, opts) => {
    target.addEventListener(ev, fn, opts);
    cleanups.push(() => target.removeEventListener(ev, fn, opts));
  };
  document.body.classList.add('loading');

/* ═══════════════════════════════════════
   UTILITY
═══════════════════════════════════════ */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function sceneP(el) {
  const r = el.getBoundingClientRect();
  const s = el.offsetHeight - innerHeight;
  return s > 0 ? clamp(-r.top / s, 0, 1) : (r.top <= 0 ? 1 : 0);
}

/* ═══════════════════════════════════════
   PROGRESS BAR
═══════════════════════════════════════ */
const pFill = document.getElementById('pFill');

/* ═══════════════════════════════════════
   HERO
═══════════════════════════════════════ */
const heroEl   = document.getElementById('hero');
const heroBg   = document.getElementById('heroBg');
const heroCont = document.getElementById('heroContent');
const heroHint = document.getElementById('heroHint');

/* ═══════════════════════════════════════
   LOADER
═══════════════════════════════════════ */
const loaderEl   = document.getElementById('page-loader');
const loaderFill = document.getElementById('loaderFill');
const loaderStart = Date.now();
const MIN_LOADER  = 1100; // minimum ms to show loader

// animate bar to 80% while loading
requestAnimationFrame(() => { if (loaderFill) loaderFill.style.width = '80%'; });

function finishLoading() {
  // complete the bar
  if (loaderFill) {
    loaderFill.style.transition = 'width 0.25s ease';
    loaderFill.style.width = '100%';
  }

  const elapsed   = Date.now() - loaderStart;
  const remaining = Math.max(0, MIN_LOADER - elapsed);

  timers.push(setTimeout(() => {
    if (loaderEl) loaderEl.classList.add('done');
    document.body.classList.remove('loading');
    timers.push(setTimeout(() => { if (loaderEl && loaderEl.parentNode) loaderEl.remove(); }, 900));

    // kick off hero text reveal after loader gone
    document.getElementById('hEyebrow').classList.add('in');
    timers.push(setTimeout(() => document.getElementById('hName').classList.add('in'), 160));
    timers.push(setTimeout(() => document.getElementById('hSpec').classList.add('in'), 360));
  }, remaining + 250)); // +250ms for bar fill animation
}
// В SPA страница монтируется уже после window load — запускаем сразу,
// иначе слушаем событие load (на случай прямого захода с долгой загрузкой).
if (document.readyState === 'complete') finishLoading();
else on(window, 'load', finishLoading);

function animHero(p) {
  heroBg.style.transform  = `scale(${1 + p * 0.09})`;
  heroBg.style.opacity    = 1 - p * 0.45;
  const cp = clamp(p * 2.8, 0, 1);
  heroCont.style.opacity   = 1 - cp;
  heroCont.style.transform = `translateX(-50%) translateY(${cp * -55}px)`;
  heroHint.style.opacity   = clamp(1 - p * 7, 0, 1);
}

/* ═══════════════════════════════════════
   TAGLINE — WORD REVEAL
═══════════════════════════════════════ */
const taglineEl = document.getElementById('tagline');
const tlWords   = document.querySelectorAll('.tl-w');
const N = tlWords.length;

function animTagline(p) {
  tlWords.forEach((w, i) => {
    const wordStart = (i / N) * 0.88;
    const wordEnd   = wordStart + (0.88 / N);
    const wp = clamp((p - wordStart) / (wordEnd - wordStart), 0, 1);
    const opacity = lerp(0.08, 1, wp);
    w.style.color = `rgba(248,244,239,${opacity.toFixed(3)})`;
  });
}

/* ═══════════════════════════════════════
   DIRECTION SCENES — CYCLING MEDIA
═══════════════════════════════════════ */
const dirScenes = document.querySelectorAll('.dir-scene');

function animDirs() {
  dirScenes.forEach(scene => {
    const p      = sceneP(scene);
    const layers = scene.querySelectorAll('.dir-layer');
    const panel  = scene.querySelector('.dir-panel');
    const n      = layers.length;

    const rawIdx = p * n;
    const active = clamp(Math.floor(rawIdx), 0, n - 1);
    const frac   = rawIdx - Math.floor(rawIdx);
    const FADE   = 0.38;

    layers.forEach((layer, i) => {
      let op = 0;
      if (i === active) {
        op = frac > (1 - FADE) ? 1 - (frac - (1 - FADE)) / FADE : 1;
      } else if (i === active + 1) {
        op = frac > (1 - FADE) ? (frac - (1 - FADE)) / FADE : 0;
      }
      layer.style.opacity = op;
    });

    // Panel: fade on enter/exit; no vertical shift on mobile
    const panelIn  = clamp(p / 0.1,  0, 1);
    const panelOut = clamp((p - 0.88) / 0.12, 0, 1);
    panel.style.opacity = (panelIn * (1 - panelOut)).toFixed(3);
    if (window.innerWidth > 768) {
      panel.style.transform = `translateY(${(1 - panelIn) * 52}px)`;
    } else {
      panel.style.transform = 'none';
    }
  });
}

/* ═══════════════════════════════════════
   INTERSECTION OBSERVER — REVEAL
═══════════════════════════════════════ */
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const delay = (e.target.dataset.d || 0) * 130;
    setTimeout(() => e.target.classList.add('in'), delay);
    io.unobserve(e.target);
  });
}, { threshold: 0.14 });

document.querySelectorAll(
  '.tl-card, .stat-item, .dir-intro-wrap, .quote-wrap, .cta-inner'
).forEach(el => io.observe(el));
cleanups.push(() => io.disconnect());

/* ═══════════════════════════════════════
   STAT COUNTERS
═══════════════════════════════════════ */
let countersRun = false;
function runCounters() {
  if (countersRun) return; countersRun = true;
  document.querySelectorAll('.stat-item').forEach(item => {
    const target = +item.dataset.count;
    const el     = item.querySelector('.cn');
    const dur    = 1700;
    const t0     = performance.now();
    (function tick(now) {
      const t   = Math.min((now - t0) / dur, 1);
      const e   = 1 - Math.pow(1 - t, 3);
      const val = Math.round(e * target);
      el.textContent = val >= 1000
        ? Math.round(val / 1000) + ' 000'
        : val;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target >= 1000 ? Math.round(target / 1000) + ' 000' : target;
    })(t0);
  });
}
const statsIo = new IntersectionObserver(e => {
  if (e[0].isIntersecting) { runCounters(); }
}, { threshold: 0.3 });
statsIo.observe(document.getElementById('stats'));
cleanups.push(() => statsIo.disconnect());

/* ═══════════════════════════════════════
   MAIN SCROLL LOOP
═══════════════════════════════════════ */
function onScroll() {
  const totalH = document.body.scrollHeight - innerHeight;
  pFill.style.width = clamp(scrollY / totalH * 100, 0, 100) + '%';

  const hp = sceneP(heroEl);
  animHero(hp);
  animTagline(sceneP(taglineEl));
  animDirs();
}

on(window, 'scroll', onScroll, { passive: true });
onScroll(); // initial render

  // ── Очистка при размонтировании ──
  return () => {
    cleanups.forEach((fn) => fn());
    timers.forEach((t) => clearTimeout(t));
    document.body.classList.remove('loading');
  };
}
