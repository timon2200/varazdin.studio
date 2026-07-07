/* ============================================================
   Studio Varaždin — Scroll Effects
   IntersectionObserver for row entry animations and
   ambient background glow shifts tied to scroll position.

   Depends on: main.js (no direct deps, operates on DOM)
   ============================================================ */

'use strict';

// ════════════════════════════════════════════════════════════
// ROW ENTRY — IntersectionObserver stagger
// ════════════════════════════════════════════════════════════

function initScrollObserver() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Slight stagger for consecutive rows entering at once
        const delay = i * 80;
        setTimeout(() => {
          entry.target.classList.add('in-view');
        }, delay);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.row-section, .reveal-up').forEach(el => observer.observe(el));

  // Gold shimmer on the About heading repaints text every frame — only let
  // it run while the heading is actually in the viewport.
  const aboutHeading = document.querySelector('.about-heading');
  if (aboutHeading) {
    new IntersectionObserver(([entry]) => {
      aboutHeading.classList.toggle('shimmer-live', entry.isIntersecting);
    }).observe(aboutHeading);
  }
}

// ════════════════════════════════════════════════════════════
// AMBIENT GLOW — Scroll-linked background temperature shift
// ════════════════════════════════════════════════════════════

function initAmbientScroll() {
  // Two stacked fixed layers, crossfaded by OPACITY when the dominant
  // section changes. Transitioning `background` (the old approach) repaints
  // the entire viewport every frame for the 1.2s of every crossfade;
  // opacity crossfades run purely on the compositor.
  const makeLayer = (color, opacity) => {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;
      inset:0;
      pointer-events:none;
      z-index:0;
      opacity:${opacity};
      transition: opacity 1.2s ease;
      background: radial-gradient(ellipse 70% 60% at 50% 50%, ${color} 0%, transparent 70%);
    `;
    return el;
  };

  const COLORS = {
    top:         'rgba(130,90,15,0.07)',
    documentary: 'rgba(80,55,10,0.06)',
    immersive:   'rgba(15,35,70,0.09)',
    'short-film':'rgba(20,55,25,0.07)',
    'music-video':'rgba(70,15,25,0.08)',
    bottom:      'rgba(100,70,10,0.06)',
  };

  let front = makeLayer(COLORS.top, 1);
  let back  = makeLayer(COLORS.top, 0);
  document.body.prepend(back);
  document.body.prepend(front);

  let current = 'top';
  let ticking = false;

  const update = () => {
    ticking = false;
    const winHeight = window.innerHeight;

    // Find which section dominates the center of viewport
    let dominant = 'top';
    for (const [key] of Object.entries(COLORS)) {
      const track = document.querySelector(`[data-row="${key}"]`);
      if (!track) continue;
      const rect = track.getBoundingClientRect();
      if (rect.top < winHeight * 0.55 && rect.bottom > winHeight * 0.45) {
        dominant = key;
        break;
      }
    }

    if (dominant === current) return;
    current = dominant;

    back.style.background = `radial-gradient(ellipse 70% 60% at 50% 50%, ${COLORS[dominant]} 0%, transparent 70%)`;
    back.style.opacity  = '1';
    front.style.opacity = '0';
    [front, back] = [back, front];
  };

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
}
