/* ============================================================
   Studio Varaždin — Main App Orchestrator
   Shared state, DOM references, constants, and initialization.

   This is the entry point. It loads AFTER all other modules:
   data.js → animations.js → hero.js → catalogue.js →
   player.js → nav.js → scroll-effects.js → main.js
   ============================================================ */

'use strict';

// ── Shared State ───────────────────────────────────────────
// These globals are read/written by multiple modules.

let heroIndex     = 0;
let heroTimer     = null;
let activeProject = null;
let activeCard    = null;
let isDragging    = false;

// ── DOM References ─────────────────────────────────────────
// Cached once at init, used by hero.js, catalogue.js, player.js, nav.js.

const nav           = document.getElementById('site-nav');
const heroSlidesEl  = document.querySelector('.hero-slides');
const heroContentEl = document.querySelector('.hero-content');
const heroDots      = document.querySelector('.hero-progress-dots');
const heroTint      = document.querySelector('.hero-tint');
const catalogue     = document.getElementById('catalogue');
const expandedView  = document.getElementById('project-expanded-view');
const expandedMedia = document.getElementById('expanded-media-layer');
const expandedGlass = document.getElementById('expanded-glass-layer');

// ── SVG Icon Constants ─────────────────────────────────────
// Inline SVGs used in dynamically-generated HTML.

const PLAY_ICON     = `<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>`;
const CLOSE_ICON    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const CHEVRON_LEFT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>`;
const CHEVRON_RIGHT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>`;
const YT_ICON       = `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;

const CATEGORY_LABELS = {
  festival:      'Festival Film',
  event:         'Event Film',
  documentary:   'Documentary',
  immersive:     'Immersive',
  'short-film':  'Short Film',
  institutional: 'Institutional',
  campaign:      'Campaign',
  'music-video': 'Music Video'
};

// ════════════════════════════════════════════════════════════
// GLOBAL EVENT WIRING
// ════════════════════════════════════════════════════════════

function initGlobalEvents() {
  // Escape to close project
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeProject) closeProject();
  });

  // Browser back button → close project instead of leaving site
  window.addEventListener('popstate', (e) => {
    if (activeProject) {
      closeProject(true); // true = triggered by popstate, don't call history.back()
    }
  });

  // Hero CTA → open project
  document.getElementById('hero-cta-view')?.addEventListener('click', e => {
    const id = e.currentTarget.dataset.projectId;
    if (!id) return;
    openProject(id, null);
  });

  // Smooth anchor scrolling
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── Custom Player event wiring ──
  const exView = document.getElementById('project-expanded-view');
  if (exView) {
    exView.addEventListener('mousemove', resetIdleTimer);
    exView.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.player-timeline-wrapper') || e.target.closest('.player-vol-slider-container')) return;
      // Don't toggle play if the user was drag-dismissing
      if (window._isDismissDragging && window._isDismissDragging()) return;
      togglePlay();
    });
  }

  document.getElementById('player-back-btn')?.addEventListener('click', () => closeProject());
  document.getElementById('expanded-close-btn')?.addEventListener('click', () => closeProject());
  document.getElementById('player-play-btn')?.addEventListener('click', togglePlay);
  document.getElementById('player-vol-btn')?.addEventListener('click', toggleMute);
  document.getElementById('player-center-state')?.addEventListener('click', togglePlay);
  document.getElementById('player-fullscreen-btn')?.addEventListener('click', toggleFullscreen);
  
  document.getElementById('player-vol-slider')?.addEventListener('input', (e) => {
    if (typeof setVolume === 'function') {
      setVolume(e.target.value);
    }
  });

  // Timeline scrub
  const timeline = document.getElementById('player-timeline-wrapper');
  if (timeline) {
    timeline.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rect = timeline.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      let pct = Math.max(0, Math.min(1, clickX / rect.width));
      if (ytPlayer && ytPlayer.getDuration) {
        ytPlayer.seekTo(ytPlayer.getDuration() * pct, true);
      }
    });
  }
}

// ════════════════════════════════════════════════════════════
// INIT — Application entry point
// ════════════════════════════════════════════════════════════

function init() {
  buildHero();
  buildCatalogue();
  initNav();
  initGlobalEvents();
  initAmbientScroll();

  // Defer scroll observer to after first paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initScrollObserver();
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
