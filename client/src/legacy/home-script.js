/* eslint-disable */
// Перенесено 1:1 из index.html. Вызывается из Home.jsx после монтирования.
// submitBooking — наш бэкенд формы записи.
import { submitBooking } from '../lib/api.js';

export function initHome() {
  const cleanups = [];
  const on = (target, ev, fn, opts) => {
    target.addEventListener(ev, fn, opts);
    cleanups.push(() => target.removeEventListener(ev, fn, opts));
  };

/* ─── CURSOR (desktop) ─── */
const cursor = document.getElementById('cursor');
const ring   = document.getElementById('cursor-ring');
if (cursor && ring && window.matchMedia('(pointer: fine)').matches) {
  let mx=0, my=0, rx=0, ry=0;
  let rafId;
  on(document, 'mousemove', e => {
    mx = e.clientX; my = e.clientY;
    cursor.style.left = mx+'px'; cursor.style.top = my+'px';
  });
  (function animate(){
    rx += (mx-rx)*0.12; ry += (my-ry)*0.12;
    ring.style.left = rx+'px'; ring.style.top = ry+'px';
    rafId = requestAnimationFrame(animate);
  })();
  cleanups.push(() => cancelAnimationFrame(rafId));
}

/* ─── NAV SCROLL ─── */
const navbar = document.getElementById('navbar');
const progressBar = document.getElementById('progress-bar');
on(window, 'scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 50);
  const total = document.body.scrollHeight - window.innerHeight;
  progressBar.style.width = (window.scrollY / total * 100) + '%';
}, { passive: true });

/* ─── MOBILE MENU ─── */
const menuToggle = document.getElementById('menuToggle');
const mobileMenu = document.getElementById('mobileMenu');
let menuOpen = false;

on(menuToggle, 'click', () => {
  menuOpen = !menuOpen;
  menuToggle.classList.toggle('active', menuOpen);
  mobileMenu.classList.toggle('open', menuOpen);
  document.body.style.overflow = menuOpen ? 'hidden' : '';
});

// inline onclick="closeMenu()" в разметке → нужен на window
window.closeMenu = function closeMenu() {
  menuOpen = false;
  menuToggle.classList.remove('active');
  mobileMenu.classList.remove('open');
  document.body.style.overflow = '';
};

/* ─── REVEAL ON SCROLL ─── */
const reveals = document.querySelectorAll('.reveal');
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
  });
}, { threshold: 0.1 });
reveals.forEach(el => io.observe(el));
cleanups.push(() => io.disconnect());

/* ─── PROCEDURE TABS ─── */
window.switchTab = function switchTab(idx) {
  document.querySelectorAll('.proc-tab').forEach((t,i) => t.classList.toggle('active', i===idx));
  document.querySelectorAll('.proc-content').forEach((c,i) => c.classList.toggle('active', i===idx));
  /* smooth scroll into view on mobile */
  if (window.innerWidth <= 640) {
    document.querySelector('.proc-content.active').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

/* ─── FORM SUBMIT → бэкенд (отправка заявки на почту) ─── */
(function() {
  const btn = document.getElementById('formSubmit');
  if (!btn) return;
  const form = btn.closest('.booking-form');
  const getVal = (sel) => {
    const el = form.querySelector(sel);
    return el ? el.value.trim() : '';
  };
  let busy = false;

  on(btn, 'click', async () => {
    if (busy) return;
    const name    = getVal('input[type="text"]');
    const phone   = getVal('input[type="tel"]');
    const email   = getVal('input[type="email"]');
    const service = getVal('.form-select');
    const note    = getVal('textarea');
    const message = [service && `Услуга: ${service}`, note].filter(Boolean).join('\n');

    if (name.length < 2 || phone.replace(/\D/g, '').length < 7) {
      btn.textContent = 'Заполните имя и телефон';
      setTimeout(() => { btn.textContent = 'Отправить заявку'; }, 2500);
      return;
    }

    busy = true;
    const orig = btn.textContent;
    btn.textContent = 'Отправляем…';
    btn.style.opacity = '0.7';

    const res = await submitBooking({ name, phone, email, message });

    busy = false;
    btn.style.opacity = '';
    if (res.ok) {
      btn.textContent = 'Заявка отправлена ✓';
      btn.style.background = 'var(--gold)';
      form.querySelectorAll('input, textarea, select').forEach((el) => { el.value = ''; });
      setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 4000);
    } else {
      btn.textContent = res.error || 'Ошибка, попробуйте позже';
      setTimeout(() => { btn.textContent = orig; }, 3500);
    }
  });
})();

/* ─── PREVENT ZOOM ON INPUT FOCUS (iOS) ─── */
if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
  document.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('focus', () => {
      document.querySelector('meta[name=viewport]')
        .setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1');
    });
    el.addEventListener('blur', () => {
      document.querySelector('meta[name=viewport]')
        .setAttribute('content','width=device-width, initial-scale=1.0');
    });
  });
}

/* ─── SOLUTION DRAWER ─── */
const solutions = [
  {
    title: 'Здоровье волос',
    body: `<p>Выпадение волос, истончение, перхоть, жирность кожи головы — всё это симптомы, а не самостоятельные болезни. Я ищу причину: дефициты, гормональный фон, аутоиммунные процессы, нарушения работы ЖКТ.</p>
    <ul>
      <li>Трихоскопия и анализ состояния волосяных фолликулов</li>
      <li>Выявление дефицитов (железо, ферритин, цинк, витамин D, биотин)</li>
      <li>Коррекция питания и нутрицевтическая поддержка</li>
      <li>Локальные и системные протоколы лечения</li>
      <li>Сопровождение до видимого результата</li>
      <li>Мезотерапия волос</li>
    </ul>`
  },
  {
    title: 'Здоровая кожа изнутри и снаружи',
    body: `<p>Акне, розацеа, купероз, сухость, тусклость — состояние кожи отражает состояние всего организма. Работаю с кожей одновременно снаружи и изнутри.</p>
    <ul>
      <li>Анализ триггеров: питание, гормоны, кишечник, стресс</li>
      <li>Нутрициологическая поддержка кожи</li>
      <li>Подбор персонального домашнего ухода</li>
      <li>Профессиональные процедуры по показаниям</li>
      <li>Дерматоскопия (оценка онкологических рисков)</li>
    </ul>`
  },
  {
    title: 'Дефициты и энергия',
    body: `<p>Хроническая усталость, туман в голове, апатия — чаще всего это не «норма» и не характер. Это сигнал нехватки ключевых нутриентов.</p>
    <ul>
      <li>Анализ микроэлементного и витаминного статуса</li>
      <li>Выявление скрытых дефицитов (B12, D, железо, магний, омега-3)</li>
      <li>Индивидуальная схема восполнения</li>
      <li>Коррекция рациона под ваш ритм жизни</li>
      <li>Контроль динамики и корректировка протокола</li>
    </ul>`
  },
  {
    title: 'Женское здоровье',
    body: `<p>ПМС, нарушения цикла, набор веса, перепады настроения, снижение либидо, молочница, цистит — всё это связано с гормональным балансом и воспалением, который можно поддержать нутрициологически.</p>
    <ul>
      <li>Разбор гормонального фона по анализам</li>
      <li>Нутрициологическая поддержка цикла</li>
      <li>Работа с эстрогендоминированием и дефицитом прогестерона</li>
      <li>Протоколы при СПКЯ, эндометриозе, менопаузе</li>
      <li>Поддержка без гормональной терапии (или в дополнение к ней)</li>
      <li>Работа с хроническим воспалением(цистит, молочница)</li>
    </ul>`
  },
  {
    title: 'Детокс и поддержка печени',
    body: `<p>Печень — центральный орган детоксикации. Её перегрузка проявляется усталостью, кожными реакциями, гормональным дисбалансом и лишним весом.</p>
    <ul>
      <li>Оценка нагрузки на детокс-системы организма</li>
      <li>Протокол мягкого детокса без жёстких диет</li>
      <li>Поддержка фаз детоксикации нутрицевтиками</li>
      <li>Коррекция питания и образа жизни</li>
      <li>Работа с жировым гепатозом и повышенными печёночными ферментами</li>
    </ul>`
  },
  {
    title: 'Персональный anti-age подход',
    body: `<p>Старение — управляемый процесс. Я работаю с его причинами: воспалением, гликацией, оксидативным стрессом, дефицитами — а не только с внешними проявлениями.</p>
    <ul>
      <li>Оценка биологического возраста по маркерам воспаления и метаболизма</li>
      <li>Антивозрастной нутрициологический протокол</li>
      <li>Поддержка синтеза коллагена изнутри</li>
      <li>Интеграция с косметологическими процедурами</li>
      <li>Долгосрочная стратегия для кожи и тела</li>
    </ul>`
  },
  {
    title: 'Подготовка к беременности',
    body: `<p>Нутрициологическая подготовка к зачатию — это инвестиция в здоровье мамы и ребёнка. Минимум за 3–6 месяцев до планируемой беременности.</p>
    <ul>
      <li>Анализ нутриентного статуса обоих партнёров</li>
      <li>Восполнение фолатов, йода, железа, омега-3, D</li>
      <li>Поддержка репродуктивной функции</li>
      <li>Снижение риска осложнений беременности</li>
      <li>Коррекция питания на весь период подготовки</li>
    </ul>`
  },
  {
    title: 'Антистресс / ресурс / сон',
    body: `<p>Хронический стресс истощает надпочечники, разрушает кишечник, нарушает сон. Я работаю с этим через питание, нутрицевтики и образ жизни.</p>
    <ul>
      <li>Оценка уровня кортизола и надпочечниковой нагрузки</li>
      <li>Протокол адаптогенов и нейротрофических нутриентов</li>
      <li>Работа с дефицитом магния, B-витаминов, ГАМК</li>
      <li>Рекомендации по режиму и гигиене сна</li>
      <li>Восстановление ресурсного состояния без стимуляторов</li>
    </ul>`
  },
  {
    title: 'Программа восстановления ЖКТ',
    body: `<p>Кишечник — второй мозг и основа иммунитета. Вздутие, запоры, диарея, дисбиоз, синдром дырявого кишечника — всё это влияет на кожу, вес и настроение.</p>
    <ul>
      <li>Анализ симптомов и пищевых триггеров</li>
      <li>Протокол восстановления слизистой кишечника</li>
      <li>Коррекция дисбиоза через питание и пробиотики</li>
      <li>Устранение воспаления в ЖКТ</li>
      <li>Мягкая сонация по показаниям</li>
    </ul>`
  },
  {
    title: 'Разбор анализов (полный чекап)',
    body: `<p>Не знаете какие анализы сдать, чтобы проверить свое здоровье ? Или сдали анализы и не знаете что с ними делать? Я читаю анализы не по «норме лаборатории», а по функциональным диапазонам.</p>
    <ul>
      <li>Разбор общего и биохимического анализа крови</li>
      <li>Оценка гормонального профиля</li>
      <li>Выявление скрытых дефицитов и воспалительных маркеров</li>
      <li>Чёткий список приоритетов коррекции</li>
      <li>Индивидуальные рекомендации по питанию и добавкам</li>
    </ul>`
  },
  {
    title: 'Коррекция веса',
    body: `<p>Лишний вес — это симптом. Я не назначаю изнуряющие диеты. Я ищу причину: инсулинорезистентность, гипотиреоз, хроническое воспаление, дефициты, стресс.</p>
    <ul>
      <li>Метаболическая диагностика по анализам</li>
      <li>Выявление и коррекция инсулинорезистентности</li>
      <li>Персональный план питания без жёстких ограничений</li>
      <li>Нутрицевтическая поддержка метаболизма</li>
      <li>Долгосрочный результат без откатов и срывов</li>
    </ul>`
  },
  {
    title: 'Индивидуальное сопровождение',
    body: `<p>Индивидуальное сопровождение в течении 2-3 мес — это комплексная работа со здоровьем, где рекомендации подбираются под ваш организм, анализы, образ жизни и цели, с поддержкой и регулярной обратной связью на каждом этапе.</p>
    <ul>
      <li>Назначение и разбор анализов</li>
      <li>Индивидуальный подбор нутрицевтиков</li>
      <li>Ваш персональный разбор и коррекция питания</li>
      <li>Регулярные созвоны лично со мной и поддержка в чате</li>
    </ul>`
  }
];

(function() {
  const overlay = document.getElementById('solutionOverlay');
  const drawer = document.getElementById('solutionDrawer');
  const drawerNum = document.getElementById('drawerNum');
  const drawerTitle = document.getElementById('drawerTitle');
  const drawerBody = document.getElementById('drawerBody');

  function openDrawer(idx) {
    const s = solutions[idx];
    drawerNum.textContent = String(idx + 1).padStart(2, '0');
    drawerTitle.textContent = s.title;
    drawerBody.innerHTML = s.body;
    overlay.classList.add('open');
    drawer.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.service-card[data-solution]').forEach(card => {
    card.addEventListener('click', () => openDrawer(+card.dataset.solution));
  });

  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  on(document, 'keydown', e => { if (e.key === 'Escape') closeDrawer(); });
})();

/* ─── ABOUT TABS ─── */
document.querySelectorAll('.about-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.about-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.about-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

/* ─── CERT LIGHTBOX ─── */
(function() {
  const lightbox = document.getElementById('certLightbox');
  const lbImg = document.getElementById('certLightboxImg');
  const grid = document.getElementById('certs-grid');
  let current = 0;

  function getCertImages() {
    return Array.from(grid.querySelectorAll('.cert-thumb img'));
  }

  function openLightbox(index) {
    const imgs = getCertImages();
    if (!imgs.length) return;
    current = index;
    lbImg.src = imgs[current].src;
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }

  function navigate(dir) {
    const imgs = getCertImages();
    current = (current + dir + imgs.length) % imgs.length;
    lbImg.src = imgs[current].src;
  }

  grid.addEventListener('click', e => {
    const thumb = e.target.closest('.cert-thumb');
    if (!thumb) return;
    const imgs = getCertImages();
    const idx = imgs.indexOf(thumb.querySelector('img'));
    if (idx >= 0) openLightbox(idx);
  });

  document.getElementById('certClose').addEventListener('click', closeLightbox);
  document.getElementById('certPrev').addEventListener('click', () => navigate(-1));
  document.getElementById('certNext').addEventListener('click', () => navigate(1));
  lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
  on(document, 'keydown', e => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
  });
})();

/* ─── MOBILE: SEGMENTED CONTROL ─── */
document.querySelectorAll('.seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('seg-active'));
    document.querySelectorAll('.about-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.about-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('seg-active');
    const tabBtn = document.querySelector('.about-tab-btn[data-tab="' + btn.dataset.tab + '"]');
    if (tabBtn) tabBtn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

/* ─── MOBILE: DRAG-TO-CLOSE DRAWER ─── */
(function() {
  const drawer = document.getElementById('solutionDrawer');
  const handle = drawer.querySelector('.drawer-sheet-handle');
  if (!handle) return;
  let startY = 0, curY = 0, dragging = false;
  handle.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY; dragging = true; curY = startY;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    curY = e.touches[0].clientY;
    const diff = curY - startY;
    if (diff > 0) drawer.style.transform = 'translateY(' + diff + 'px)';
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    const diff = curY - startY;
    drawer.style.transform = '';
    if (diff > 100) {
      document.getElementById('solutionOverlay').classList.remove('open');
      drawer.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
})();

/* ─── MOBILE: HERO PARALLAX ─── */
(function() {
  const heroRight = document.querySelector('.hero-right');
  if (!heroRight) return;
  function onScroll() {
    if (window.innerWidth > 768) return;
    const y = window.scrollY;
    if (y < window.innerHeight) {
      heroRight.style.transform = 'translateY(' + (y * 0.2) + 'px)';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
})();

/* ─── SWIPE DOTS — services & reviews ─── */
(function() {
  function initDots(trackId, dotsId, cardSelector) {
    const track = document.getElementById(trackId);
    const dotsEl = document.getElementById(dotsId);
    if (!track || !dotsEl) return;
    const dots = dotsEl.querySelectorAll('.swipe-dot');
    const cards = track.querySelectorAll(cardSelector);
    if (!cards.length || !dots.length) return;

    function update() {
      const cardW = track.scrollWidth / cards.length;
      const idx   = Math.min(Math.round(track.scrollLeft / cardW), dots.length - 1);
      dots.forEach((d, i) => d.classList.toggle('on', i === idx));
    }

    track.addEventListener('scroll', update, { passive: true });
    update();
  }

  initDots('servicesGrid', 'servicesDots', '.service-card');
  initDots('reviewsTrack', 'reviewsDots',  '.review-card');
})();

/* ─── DIPLOMA LIGHTBOX ─── */
(function() {
  const lightbox = document.getElementById('diplomaLightbox');
  const lbImg    = document.getElementById('diplomaLightboxImg');
  const closeBtn = document.getElementById('diplomaClose');
  const prevBtn  = document.getElementById('diplomaPrev');
  const nextBtn  = document.getElementById('diplomaNext');
  let images = [], current = 0;

  function show(idx) {
    current = (idx + images.length) % images.length;
    lbImg.src = images[current];
    prevBtn.style.display = images.length > 1 ? 'flex' : 'none';
    nextBtn.style.display = images.length > 1 ? 'flex' : 'none';
  }
  function open(srcs) {
    images = srcs;
    show(0);
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
    lbImg.src = '';
  }

  document.querySelectorAll('.credential-item[data-diploma]').forEach(item => {
    item.addEventListener('click', () => {
      const val = item.dataset.diploma;
      if (!val) return;
      open(val.split(',').map(s => s.trim()).filter(Boolean));
    });
  });

  prevBtn.addEventListener('click', () => show(current - 1));
  nextBtn.addEventListener('click', () => show(current + 1));
  closeBtn.addEventListener('click', close);
  lightbox.addEventListener('click', e => { if (e.target === lightbox) close(); });
  on(document, 'keydown', e => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
})();

  // ── Очистка при размонтировании (важно для SPA-навигации) ──
  return () => {
    cleanups.forEach((fn) => fn());
    document.body.style.overflow = '';
  };
}
