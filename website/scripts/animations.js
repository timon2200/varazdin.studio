/* ============================================================
   Studio Varaždin — Animation Helpers
   Reusable reveal/transition primitives used across the site.
   ============================================================ */

'use strict';

/**
 * Fog-lift reveal: blur + fade + subtle translateY → sharp.
 * Returns a promise that resolves when the animation completes.
 *
 * @param {HTMLElement} el    — Element to animate
 * @param {Object}      opts  — { duration, delay, y, blur }
 * @returns {Promise<void>}
 */
function fogLift(el, {
  duration = 700,
  delay    = 0,
  y        = 14,
  blur     = 10,
} = {}) {
  return new Promise(resolve => {
    el.style.cssText += `
      opacity:0;
      transform:translateY(${y}px);
      filter:blur(${blur}px);
      transition:
        opacity ${duration}ms cubic-bezier(0.16,1,0.30,1) ${delay}ms,
        transform ${duration}ms cubic-bezier(0.16,1,0.30,1) ${delay}ms,
        filter ${duration * 0.9}ms cubic-bezier(0.16,1,0.30,1) ${delay}ms;
      will-change: opacity, transform, filter;
    `;

    // Force reflow
    el.offsetHeight;

    el.style.opacity   = '1';
    el.style.transform = 'translateY(0)';
    el.style.filter    = 'blur(0)';

    setTimeout(resolve, duration + delay);
  });
}

/**
 * Word-by-word stagger reveal on a paragraph element.
 * Splits text into <span class="word"> elements and animates each.
 *
 * @param {HTMLElement} el    — Paragraph element
 * @param {Object}      opts  — { delay, wordDelay, duration }
 */
function wordStagger(el, { delay = 0, wordDelay = 42, duration = 500 } = {}) {
  const text = el.textContent;
  el.textContent = '';
  el.style.opacity = '1';
  el.style.filter = 'blur(0)';

  const words = text.split(' ');
  words.forEach((word, i) => {
    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = word;

    const t = delay + i * wordDelay;
    span.style.cssText = `
      display:inline-block;
      opacity:0;
      transform:translateY(7px);
      transition:
        opacity ${duration}ms cubic-bezier(0.22,1,0.36,1) ${t}ms,
        transform ${duration}ms cubic-bezier(0.22,1,0.36,1) ${t}ms;
      will-change: opacity, transform;
    `;
    el.appendChild(span);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
  });

  // Trigger reflow then animate
  el.offsetHeight;
  el.querySelectorAll('.word').forEach(w => {
    w.style.opacity = '1';
    w.style.transform = 'translateY(0)';
  });
}

/**
 * Spring pop-in — for badges and small UI elements.
 *
 * @param {HTMLElement} el    — Element to pop in
 * @param {Object}      opts  — { delay }
 */
function springPop(el, { delay = 0 } = {}) {
  el.style.cssText += `
    opacity:0;
    transform:translateY(14px) scale(0.88);
    filter:blur(3px);
    transition:
      opacity 420ms cubic-bezier(0.34,1.56,0.64,1) ${delay}ms,
      transform 420ms cubic-bezier(0.34,1.56,0.64,1) ${delay}ms,
      filter 300ms ease ${delay}ms;
    will-change: opacity, transform, filter;
  `;
  el.offsetHeight;
  el.style.opacity   = '1';
  el.style.transform = 'translateY(0) scale(1)';
  el.style.filter    = 'blur(0)';
}
