/* ============================================================
   Studio Varaždin — Catalogue Rows & Cards
   Builds the Netflix-style scrollable category rows and
   project cards with drag-to-scroll momentum.

   Depends on: data.js  (PROJECTS, ROWS, CATEGORY_LABELS),
               main.js  (catalogue, PLAY_ICON, CHEVRON_LEFT, CHEVRON_RIGHT, isDragging),
               player.js (openProject)
   ============================================================ */

'use strict';

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

    // Arrow scroll
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

  card.addEventListener('click', () => { if (!isDragging) openProject(project.id, card); });
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProject(project.id, card); }
  });

  return card;
}

// ── Drag-to-scroll with momentum ────────────────────────────

function enableDragScroll(el) {
  let isDown = false, startX, scrollLeft, velX = 0, lastX, lastT, rafId, didMove = false;

  el.addEventListener('mousedown', e => {
    isDown = true;
    didMove = false;
    startX = e.pageX - el.offsetLeft;
    scrollLeft = el.scrollLeft;
    lastX = e.pageX;
    lastT = Date.now();
    velX = 0;
    el.classList.add('dragging');
    cancelAnimationFrame(rafId);
  });

  window.addEventListener('mouseup', () => {
    if (!isDown) return;
    isDown = false;
    el.classList.remove('dragging');

    const glide = () => {
      if (Math.abs(velX) < 0.5) return;
      el.scrollLeft -= velX;
      velX *= 0.92;
      rafId = requestAnimationFrame(glide);
    };
    requestAnimationFrame(glide);
    
    if (didMove) {
      isDragging = true;
      setTimeout(() => { isDragging = false; }, 50);
    }
  });

  el.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    if (Math.abs(e.pageX - lastX) > 4) didMove = true;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startX) * 1.3;
    el.scrollLeft = scrollLeft - walk;

    const now = Date.now();
    velX = (lastX - e.pageX) / (now - lastT + 1) * 16;
    lastX = e.pageX;
    lastT = now;
  });

  el.addEventListener('mouseleave', () => {
    if (isDown) {
      isDown = false;
      el.classList.remove('dragging');
      if (didMove) {
        isDragging = true;
        setTimeout(() => { isDragging = false; }, 50);
      }
    }
  });

  // Touch
  let touchStartX;
  el.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    scrollLeft = el.scrollLeft;
    didMove = false;
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    if (Math.abs(e.touches[0].clientX - touchStartX) > 5) didMove = true;
    el.scrollLeft = scrollLeft + (touchStartX - e.touches[0].clientX);
  }, { passive: true });

  el.addEventListener('touchend', () => {
    if (didMove) {
      isDragging = true;
      setTimeout(() => { isDragging = false; }, 50);
    }
  });
}
