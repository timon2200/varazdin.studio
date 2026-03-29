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

  document.querySelectorAll('.row-section').forEach(el => observer.observe(el));
}

// ════════════════════════════════════════════════════════════
// AMBIENT GLOW — Scroll-linked background temperature shift
// ════════════════════════════════════════════════════════════

function initAmbientScroll() {
  // Create a fixed ambient glow overlay
  const glow = document.createElement('div');
  glow.style.cssText = `
    position:fixed;
    inset:0;
    pointer-events:none;
    z-index:0;
    transition: background 1.2s ease;
    background: radial-gradient(ellipse 60% 50% at 50% 60%, rgba(100,70,10,0.06) 0%, transparent 70%);
  `;
  document.body.prepend(glow);

  const COLORS = {
    top:         'rgba(130,90,15,0.07)',
    documentary: 'rgba(80,55,10,0.06)',
    immersive:   'rgba(15,35,70,0.09)',
    'short-film':'rgba(20,55,25,0.07)',
    'music-video':'rgba(70,15,25,0.08)',
    bottom:      'rgba(100,70,10,0.06)',
  };

  window.addEventListener('scroll', () => {
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

    glow.style.background = `radial-gradient(ellipse 70% 60% at 50% 50%, ${COLORS[dominant] || COLORS.top} 0%, transparent 70%)`;
  }, { passive: true });
}
