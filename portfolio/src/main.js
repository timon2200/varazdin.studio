import './style.css';
import { PROJECTS, FEATURED, ROWS } from './data.js';

'use strict';

// ── State ──────────────────────────────────────────────────
let heroIndex   = 0;
let heroTimer   = null;
let activeProject = null;
let isDragging  = false;

// ── DOM refs ───────────────────────────────────────────────
const nav          = document.getElementById('site-nav');
const heroSlidesEl = document.querySelector('.hero-slides');
const heroContentEl= document.querySelector('.hero-content');
const heroDots     = document.querySelector('.hero-progress-dots');
const heroTint     = document.querySelector('.hero-tint');
const catalogue    = document.getElementById('catalogue');
const modal        = document.getElementById('modal');
const modalOverlay = document.getElementById('modal-overlay');
const modalInner   = document.querySelector('.modal-inner');

// ── SVG Icons ──────────────────────────────────────────────
const PLAY_ICON    = `<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>`;
const CLOSE_ICON   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const CHEVRON_LEFT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>`;
const CHEVRON_RIGHT= `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>`;

const CATEGORY_LABELS = {
  festival:      'Festival Film',
  event:         'Event Film',
  documentary:   'Documentary',
  immersive:     'Immersive Experience',
  'short-film':  'Short Film',
  institutional: 'Institutional',
  campaign:      'Campaign',
  'music-video': 'Music Video'
};

// ════════════════════════════════════════════════════════════
// ANIMATION HELPERS
// ════════════════════════════════════════════════════════════

/**
 * Fog-lift: blur → sharp reveal.
 * Uses CSS transitions — GPU-composited (opacity + transform only).
 * blur() is used only on hero titles/badge, NOT on cards.
 */
function fogLift(el, { duration = 700, delay = 0, y = 14, blur = 10, useBlur = true } = {}) {
  return new Promise(resolve => {
    const blurProp = useBlur
      ? `, filter ${Math.round(duration * 0.9)}ms cubic-bezier(0.16,1,0.30,1) ${delay}ms`
      : '';

    el.style.cssText += `
      opacity:0;
      transform:translateY(${y}px);
      ${useBlur ? `filter:blur(${blur}px);` : ''}
      transition:
        opacity ${duration}ms cubic-bezier(0.16,1,0.30,1) ${delay}ms,
        transform ${duration}ms cubic-bezier(0.16,1,0.30,1) ${delay}ms
        ${blurProp};
      will-change: opacity, transform;
    `;

    // Force reflow
    void el.offsetHeight;

    el.style.opacity   = '1';
    el.style.transform = 'translateY(0)';
    if (useBlur) el.style.filter = 'blur(0)';

    setTimeout(resolve, duration + delay);
  });
}

/**
 * Word-by-word stagger.
 * FIX: clears parent filter before animating to prevent stuck blur.
 */
function wordStagger(el, { delay = 0, wordDelay = 40, duration = 480 } = {}) {
  const text = el.textContent;

  // ── BUG FIX: clear any blur/opacity set on the parent during reset ──
  el.style.filter    = 'none';
  el.style.opacity   = '1';
  el.style.transform = 'none';
  el.style.transition = 'none';

  el.textContent = '';

  const words = text.split(' ');
  words.forEach((word, i) => {
    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = word + (i < words.length - 1 ? ' ' : '');
    const t = delay + i * wordDelay;
    span.style.cssText = `
      display:inline-block;
      opacity:0;
      transform:translateY(6px);
      transition:
        opacity ${duration}ms cubic-bezier(0.22,1,0.36,1) ${t}ms,
        transform ${duration}ms cubic-bezier(0.22,1,0.36,1) ${t}ms;
      will-change: opacity, transform;
    `;
    el.appendChild(span);
  });

  void el.offsetHeight;

  el.querySelectorAll('.word').forEach(w => {
    w.style.opacity   = '1';
    w.style.transform = 'translateY(0)';
  });
}

// ════════════════════════════════════════════════════════════
// HERO
// ════════════════════════════════════════════════════════════

function buildHero() {
  if (!FEATURED.length) return;

  // Slides
  FEATURED.forEach((p, i) => {
    const slide = document.createElement('div');
    slide.className = 'hero-slide' + (i === 0 ? ' active' : '');
    slide.style.backgroundImage = `url('${p.heroImage}')`;
    slide.dataset.projectId = p.id;
    heroSlidesEl.appendChild(slide);
  });

  // Capsule progress dots
  FEATURED.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    dot.addEventListener('click', () => goToHeroSlide(i));
    heroDots.appendChild(dot);
  });

  renderHeroContent(0, true);
  startHeroTimer();
}

function goToHeroSlide(idx) {
  const slides = heroSlidesEl.querySelectorAll('.hero-slide');
  const dots   = heroDots.querySelectorAll('.hero-dot');

  slides[heroIndex].classList.remove('active');
  dots[heroIndex].classList.remove('active');

  heroIndex = (idx + FEATURED.length) % FEATURED.length;

  slides[heroIndex].classList.add('active');
  dots[heroIndex].classList.add('active');

  renderHeroContent(heroIndex, false);
  resetHeroTimer();
}

function renderHeroContent(idx, isInitial = false) {
  const p = FEATURED[idx];

  heroTint.style.background = p.themeColor;

  const badge       = heroContentEl.querySelector('.hero-badge');
  const title       = heroContentEl.querySelector('.hero-title');
  const subtitle    = heroContentEl.querySelector('.hero-subtitle');
  const description = heroContentEl.querySelector('.hero-description');
  const actions     = heroContentEl.querySelector('.hero-actions');

  badge.textContent       = CATEGORY_LABELS[p.category] || p.type;
  title.textContent       = p.title;
  subtitle.textContent    = p.subtitle;
  description.textContent = p.description.slice(0, 220) + '…';
  heroContentEl.querySelector('#hero-cta-view').dataset.projectId = p.id;

  // Reset all elements — clear inline styles cleanly
  [badge, title, subtitle, actions].forEach(el => {
    el.style.cssText = 'opacity:0; transform:translateY(14px); will-change:opacity,transform;';
  });
  title.classList.remove('shimmer');
  // Description reset — no filter (will use wordStagger which clears itself)
  description.style.cssText = 'opacity:0; will-change:opacity,transform;';

  void heroContentEl.offsetHeight;

  const base = isInitial ? 450 : 120;

  // Badge — no blur (pill element), clean fade+slide
  fogLift(badge, { duration: 480, delay: base, y: 8, useBlur: false });

  // Title — signature fog-lift with blur (this is fine — ONE element)
  fogLift(title, { duration: 820, delay: base + 100, y: 16, blur: 12 })
    .then(() => title.classList.add('shimmer'));

  // Subtitle — no blur
  fogLift(subtitle, { duration: 500, delay: base + 240, y: 8, useBlur: false });

  // Description — word stagger (no blur)
  setTimeout(() => {
    wordStagger(description, { delay: 0, wordDelay: 36, duration: 460 });
  }, base + 380);

  // Actions — no blur
  fogLift(actions, { duration: 460, delay: base + 560, y: 8, useBlur: false });
}

function startHeroTimer() {
  heroTimer = setInterval(() => goToHeroSlide(heroIndex + 1), 6000);
}

function resetHeroTimer() {
  clearInterval(heroTimer);
  startHeroTimer();
}

// ════════════════════════════════════════════════════════════
// CATALOGUE
// ════════════════════════════════════════════════════════════

function buildCatalogue() {
  ROWS.forEach(row => {
    const filtered = PROJECTS.filter(row.filter);
    if (!filtered.length) return;

    const section = document.createElement('section');
    section.className = 'row-section';
    section.innerHTML = `
      <div class="row-header">
        <h2 class="row-label">
          ${row.label}
          <span class="row-count">${filtered.length} film${filtered.length !== 1 ? 's' : ''}</span>
        </h2>
      </div>
      <div class="row-track-wrapper">
        <button class="row-arrow row-arrow-left" aria-label="Scroll left">${CHEVRON_LEFT}</button>
        <div class="row-track" data-row="${row.id}"></div>
        <button class="row-arrow row-arrow-right" aria-label="Scroll right">${CHEVRON_RIGHT}</button>
      </div>
    `;

    const track = section.querySelector('.row-track');
    filtered.forEach(p => track.appendChild(buildCard(p)));

    section.querySelector('.row-arrow-left').addEventListener('click', () => {
      track.scrollBy({ left: -track.offsetWidth * 0.65, behavior: 'smooth' });
    });
    section.querySelector('.row-arrow-right').addEventListener('click', () => {
      track.scrollBy({ left: track.offsetWidth * 0.65, behavior: 'smooth' });
    });

    enableDragScroll(track);
    catalogue.appendChild(section);
  });
}

function buildCard(project) {
  const card = document.createElement('div');
  card.className = 'project-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `View project: ${project.title}`);
  card.dataset.projectId = project.id;

  card.innerHTML = `
    <div class="card-image">
      <img src="${project.thumbnail}" alt="${project.title}" loading="lazy">
      <div class="card-play">${PLAY_ICON}</div>
      <div class="card-info">
        <div class="card-title">${project.title}</div>
        <div class="card-meta">
          <span>${project.year}</span>
          <span class="card-meta-dot"></span>
          <span>${CATEGORY_LABELS[project.category] || project.type}</span>
          <span class="card-meta-dot"></span>
          <span>${project.duration}</span>
        </div>
        <div class="card-tagline">${project.tagline}</div>
      </div>
    </div>
    <span class="card-badge">${CATEGORY_LABELS[project.category] || project.type}</span>
  `;

  card.addEventListener('click', () => { if (!isDragging) openModal(project.id); });
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(project.id); }
  });

  return card;
}

// ── Drag-to-scroll with momentum ────────────────────────────
function enableDragScroll(el) {
  let startX, scrollLeft, velX = 0, lastX, lastT, rafId;
  let isDown = false;

  const onDown = e => {
    isDown = true;
    isDragging = false;
    startX = e.pageX - el.offsetLeft;
    scrollLeft = el.scrollLeft;
    lastX = e.pageX;
    lastT = Date.now();
    velX = 0;
    el.classList.add('dragging');
    cancelAnimationFrame(rafId);
  };

  const onUp = () => {
    if (!isDown) return;
    isDown = false;
    el.classList.remove('dragging');

    // Momentum glide
    const glide = () => {
      if (Math.abs(velX) < 0.4) { isDragging = false; return; }
      el.scrollLeft -= velX;
      velX *= 0.90;
      rafId = requestAnimationFrame(glide);
    };
    requestAnimationFrame(glide);

    setTimeout(() => { isDragging = false; }, 80);
  };

  const onMove = e => {
    if (!isDown) return;
    e.preventDefault();
    isDragging = true;
    const x = e.pageX - el.offsetLeft;
    el.scrollLeft = scrollLeft - (x - startX) * 1.25;
    const now = Date.now();
    velX = (lastX - e.pageX) / (now - lastT + 1) * 14;
    lastX = e.pageX;
    lastT = now;
  };

  el.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  el.addEventListener('mousemove', onMove);
  el.addEventListener('mouseleave', () => isDown && el.classList.remove('dragging'));

  // Touch
  let touchX;
  el.addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX;
    scrollLeft = el.scrollLeft;
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    el.scrollLeft = scrollLeft + (touchX - e.touches[0].clientX);
  }, { passive: true });
}

// ════════════════════════════════════════════════════════════
// MODAL
// ════════════════════════════════════════════════════════════

function openModal(projectId) {
  const project = PROJECTS.find(p => p.id === projectId);
  if (!project) return;
  activeProject = project;

  const teamStr    = project.team.join(', ');
  const badgesHTML = project.badges.map(b => `<span class="modal-badge">${b}</span>`).join('');
  const awardsHTML = project.awards.length
    ? project.awards.map(a => `<span class="modal-badge">🏆 ${a}</span>`).join('')
    : '';

  modalInner.innerHTML = `
    <button class="modal-close" id="modal-close-btn" aria-label="Close">${CLOSE_ICON}</button>
    <div class="modal-visual">
      <img src="${project.heroImage}" alt="${project.title}">
    </div>
    <div class="modal-content">
      <div class="modal-type">${CATEGORY_LABELS[project.category] || project.type}</div>
      <h2 class="modal-title">${project.title}</h2>
      <div class="modal-subtitle">${project.subtitle}</div>
      <div class="modal-tagline">"${project.tagline}"</div>
      <p class="modal-description">${project.description}</p>
      <div class="modal-meta-grid">
        <div class="modal-meta-item">
          <label>Year</label>
          <span>${project.year}</span>
        </div>
        <div class="modal-meta-item">
          <label>Duration</label>
          <span>${project.duration}</span>
        </div>
        <div class="modal-meta-item">
          <label>Client</label>
          <span>${project.client}</span>
        </div>
        <div class="modal-meta-item">
          <label>Director</label>
          <span>${project.director}</span>
        </div>
        <div class="modal-meta-item" style="grid-column: 1 / -1;">
          <label>Team</label>
          <span>${teamStr}</span>
        </div>
      </div>
      ${badgesHTML || awardsHTML
        ? `<div class="modal-badges">${awardsHTML}${badgesHTML}</div>`
        : ''}
    </div>
  `;

  modal.classList.add('open');
  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Staggered interior reveal
  const seq = [
    { sel: '.modal-type',        delay: 180 },
    { sel: '.modal-title',       delay: 310 },
    { sel: '.modal-subtitle',    delay: 440 },
    { sel: '.modal-tagline',     delay: 540 },
    { sel: '.modal-description', delay: 640 },
    { sel: '.modal-meta-grid',   delay: 780 },
    { sel: '.modal-badges',      delay: 920 },
  ];

  seq.forEach(({ sel, delay }) => {
    const el = modalInner.querySelector(sel);
    if (el) setTimeout(() => el.classList.add('reveal'), delay);
  });

  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
}

function closeModal() {
  modal.classList.remove('open');
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
  activeProject = null;
}

// ════════════════════════════════════════════════════════════
// SCROLL OBSERVER
// ════════════════════════════════════════════════════════════

function initScrollObserver() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('in-view'), i * 60);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.07, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.row-section').forEach(el => observer.observe(el));
}

// ════════════════════════════════════════════════════════════
// NAV
// ════════════════════════════════════════════════════════════

function initNav() {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  const toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  nav.querySelectorAll('.nav-links a').forEach(a => {
    a.addEventListener('click', () => {
      nav.classList.remove('nav-open');
      document.querySelector('.nav-toggle')?.setAttribute('aria-expanded', 'false');
    });
  });
}

// ════════════════════════════════════════════════════════════
// GLOBAL EVENTS
// ════════════════════════════════════════════════════════════

function initGlobalEvents() {
  modalOverlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeProject) closeModal();
  });

  document.getElementById('hero-cta-view')?.addEventListener('click', e => {
    const id = e.currentTarget.dataset.projectId;
    if (id) openModal(id);
  });

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════

function init() {
  buildHero();
  buildCatalogue();
  initNav();
  initGlobalEvents();

  requestAnimationFrame(() => requestAnimationFrame(initScrollObserver));
}

document.addEventListener('DOMContentLoaded', init);
