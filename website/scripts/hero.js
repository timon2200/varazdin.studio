/* ============================================================
   Studio Varaždin — Hero Slideshow
   Builds the hero section, manages slide transitions and
   animated content reveals.
   
   Depends on: data.js (FEATURED, CATEGORY_LABELS),
               main.js  (heroSlidesEl, heroContentEl, heroDots, heroTint, heroIndex, heroTimer),
               animations.js (fogLift, wordStagger)
   ============================================================ */

'use strict';

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

  renderHeroContent(0, true); // true = initial load, run full entrance
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

  // Update tint
  heroTint.style.background = p.themeColor;

  // ── Update text content ──
  const badge       = heroContentEl.querySelector('.hero-badge');
  const title       = heroContentEl.querySelector('.hero-title');
  const subtitle    = heroContentEl.querySelector('.hero-subtitle');
  const description = heroContentEl.querySelector('.hero-description');
  const actions     = heroContentEl.querySelector('.hero-actions');

  badge.textContent       = CATEGORY_LABELS[p.category] || p.type;
  title.textContent       = p.title;
  subtitle.textContent    = p.subtitle;
  description.textContent = p.description.slice(0, 210) + '…';
  heroContentEl.querySelector('#hero-cta-view').dataset.projectId = p.id;

  // Reset all to hidden
  [badge, title, subtitle, description, actions].forEach(el => {
    el.style.opacity   = '0';
    el.style.transform = 'translateY(14px)';
    el.style.filter    = 'blur(10px)';
    el.style.transition = 'none';
    // Remove shimmer while transitioning
    title.classList.remove('shimmer');
  });

  // Force reflow
  heroContentEl.offsetHeight;

  const baseDelay = isInitial ? 400 : 100;

  // Badge — glass pill gentle fade
  fogLift(badge, { duration: 500, delay: baseDelay, y: 10, blur: 6 });

  // Title — signature fog lift
  fogLift(title, { duration: 900, delay: baseDelay + 120, y: 18, blur: 14 })
    .then(() => {
      // Start gold shimmer after reveal
      title.classList.add('shimmer');
    });

  // Subtitle
  fogLift(subtitle, { duration: 550, delay: baseDelay + 280, y: 10, blur: 8 });

  // Description — word stagger
  setTimeout(() => {
    wordStagger(description, { delay: 0, wordDelay: 38, duration: 480 });
  }, baseDelay + 420);

  // Actions
  fogLift(actions, { duration: 500, delay: baseDelay + 600, y: 10, blur: 6 });
}

function startHeroTimer() {
  heroTimer = setInterval(() => goToHeroSlide(heroIndex + 1), 6000);
}

function resetHeroTimer() {
  clearInterval(heroTimer);
  startHeroTimer();
}
