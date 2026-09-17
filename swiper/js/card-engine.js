/**
 * Studio Varaždin — Card Engine (Tinder-style 3D Physics Swiper)
 * 60fps gesture-driven swipe stack with modern linear() spring curves and dynamic adaptive ordering.
 */

import { DynamicDeckOrdering } from './deck-ordering.js?v=3.1.0';

export class CardEngine {
  constructor(options = {}) {
    this.container = options.container;
    this.catalog = options.catalog || [];
    this.analytics = options.analytics;
    this.audioHaptics = options.audioHaptics;
    this.orderingEngine = options.orderingEngine || new DynamicDeckOrdering();
    this.onVoteCallback = options.onVote || (() => {});
    this.onDeckEmptyCallback = options.onDeckEmpty || (() => {});
    this.onCardChangeCallback = options.onCardChange || (() => {});
    this.onImageClickCallback = options.onImageClick || (() => {});

    this.deck = [];
    this.cardsEl = [];
    this.currentIndex = 0;
    this.history = [];
    this.isDragging = false;
    this.activeFilter = 'ALL';

    // Physics tuning constants (tuned for ultra-responsive swiping & crisp flicking)
    this.THRESHOLD = 65;             // px to trigger swipe (lowered from 85 for responsive swiping)
    this.SUPERLIKE_THRESHOLD = -95;  // px upward to trigger superlike
    this.FLICK = 0.35;               // px/ms velocity flick threshold
    this.VISIBLE_DEPTH = 3;          // number of cards visible in depth stack

    // Stack transform matrix [y-offset px, scale, rotation deg, opacity]
    this.SLOTS = [
      [0, 1.0, 0, 1.0],
      [12, 0.965, 3.5, 0.94],
      [24, 0.93, -3.5, 0.82],
      [36, 0.895, 1.5, 0.45]
    ];

    this.SHADOWS = [
      'var(--shadow-bold-lg)',
      'var(--shadow-bold-md)',
      'var(--shadow-bold-sm)',
      'var(--shadow-bold-xs)'
    ];

    this.initKeyboard();
  }

  initKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (this.currentIndex >= this.cardsEl.length) return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        const chip = document.getElementById('retroKeyPass');
        if (chip) chip.classList.add('is-pressed');
        this.swipeAction('left');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        const chip = document.getElementById('retroKeyLike');
        if (chip) chip.classList.add('is-pressed');
        this.swipeAction('right');
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        const chip = document.getElementById('retroKeySuper');
        if (chip) chip.classList.add('is-pressed');
        this.swipeAction('superlike');
      } else if (e.key === 'u' || e.key === 'U' || (e.ctrlKey && e.key === 'z')) {
        e.preventDefault();
        this.undo();
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        const chip = document.getElementById('retroKeyPass');
        if (chip) chip.classList.remove('is-pressed');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        const chip = document.getElementById('retroKeyLike');
        if (chip) chip.classList.remove('is-pressed');
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        const chip = document.getElementById('retroKeySuper');
        if (chip) chip.classList.remove('is-pressed');
      }
    });
  }

  setDeck(items, filter = 'ALL') {
    this.activeFilter = filter;
    
    // Compute dynamic order using Multi-Phase Bayesian OmniActive Engine
    const globalStats = this.analytics ? (this.analytics.statsCache || this.analytics.computeLocalStats()) : {};
    const sessionVotes = this.analytics ? this.analytics.sessionVotes : [];

    this.deck = this.orderingEngine.orderDeck(items, globalStats, sessionVotes, filter);
    this.renderDeck();
  }

  renderDeck() {
    this.container.innerHTML = '';
    this.cardsEl = [];
    this.currentIndex = 0;
    this.history = [];

    if (!this.deck.length) {
      this.container.innerHTML = `
        <div class="deck-empty-state">
          <p class="empty-title">NEMA DIZAJNA U OVOJ KATEGORIJI</p>
          <p class="empty-sub">Odaberi drugu kategoriju na vrhu.</p>
        </div>
      `;
      return;
    }

    this.deck.forEach((data, index) => {
      const card = document.createElement('article');
      card.className = 'tshirt-card';
      card.dataset.index = index;
      card.dataset.id = data.id;
      if (data._orderingMeta && data._orderingMeta.phase) {
        card.dataset.phase = data._orderingMeta.phase;
      }

      // Use optimized WebP image with safe URL encoding
      const rawSrc = data.image.includes('assets/optimized/') 
        ? data.image 
        : data.image.replace('assets/designs/', 'assets/optimized/').replace(/\.(png|jpg)$/, '.webp');
      const safeSrc = encodeURI(rawSrc);

      card.innerHTML = `
        <div class="card-inner">
          <div class="card-photo-wrapper">
            <div class="artwork-frame">
              <img src="${safeSrc}" 
                   class="tshirt-artwork" 
                   alt="Studio Varaždin T-Shirt: ${data.title}" 
                   draggable="false" 
                   loading="${index < 6 ? 'eager' : 'lazy'}"
                   ${index === 0 ? 'fetchpriority="high"' : ''}>
              
              <!-- Tactile 2K Zoom Badge -->
              <button class="card-zoom-badge" title="Puni 2K prikaz (Klikni za zumiranje)" aria-label="2K Zoom" type="button">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <span>2K ZOOM</span>
              </button>
            </div>
            
            <!-- Dynamic Interaction Stamps -->
            <div class="stamp stamp-like"><span class="stamp-text">SVIĐA MI SE</span></div>
            <div class="stamp stamp-nope"><span class="stamp-text">NE</span></div>
            <div class="stamp stamp-superlike"><span class="stamp-text">★ SUPERLIKE ★</span></div>
          </div>

          <!-- Bottom Card Meta HUD -->
          <div class="card-hud">
            <div class="card-hud-left">
              <span class="hud-category">${(data.category || 'ARTWEAR').toUpperCase()} SERIES</span>
              <h2 class="hud-title">${data.title}</h2>
            </div>
            <div class="card-hud-right">
              <span class="hud-tag">1181 • cCc</span>
            </div>
          </div>
        </div>
      `;

      card.style.zIndex = String(this.deck.length - index);
      this.container.appendChild(card);
      this.cardsEl.push(card);
      this.applySlotTransform(card, index);

      // Entrance cascade animation for top items
      if (index <= this.VISIBLE_DEPTH) {
        card.classList.add('card-entrance');
        card.style.animationDelay = `${index * 80}ms`;
        card.addEventListener('animationend', () => {
          card.classList.remove('card-entrance');
          card.style.animationDelay = '';
        }, { once: true });
      }
    });

    if (this.cardsEl[0]) {
      this.attachDrag(this.cardsEl[0]);
    }
    this.preloadAhead(0, 8);
    this.notifyCardChange();
  }

  preloadAhead(startIndex, count = 8) {
    const end = Math.min(startIndex + count, this.deck.length);
    for (let i = startIndex; i < end; i++) {
      const it = this.deck[i];
      if (!it || !it.image) continue;
      const raw = it.image.includes('assets/optimized/') ? it.image : it.image.replace('assets/designs/', 'assets/optimized/').replace(/\.(png|jpg)$/, '.webp');
      const img = new Image();
      img.src = encodeURI(raw);
    }
  }

  applySlotTransform(card, index) {
    const diff = index - this.currentIndex;
    if (diff < 0) {
      card.style.pointerEvents = 'none';
      card.style.zIndex = '0';
      return;
    }

    const slotIndex = Math.min(diff, this.SLOTS.length - 1);
    const [y, scale, rot, opacity] = this.SLOTS[slotIndex];

    card.style.transformOrigin = '50% 90%';
    card.style.transform = `translate3d(0px, ${y}px, 0px) scale(${scale}) rotate(${rot}deg)`;
    card.style.opacity = diff > this.VISIBLE_DEPTH ? '0' : String(opacity);
    card.style.boxShadow = this.SHADOWS[slotIndex];
    card.style.visibility = diff > this.VISIBLE_DEPTH ? 'hidden' : 'visible';
    card.style.pointerEvents = diff === 0 ? 'auto' : 'none';
    card.style.zIndex = String(100 - diff * 10);
  }

  attachDrag(card) {
    if (!card) return;

    let startX = 0, startY = 0;
    let dx = 0, dy = 0;
    let vx = 0, vy = 0;
    let isDragging = false;
    let hasMoved = false;
    let startTime = 0;
    let activePointerId = null;
    let targetIsArtwork = false;
    let positions = [];

    const stampLike = card.querySelector('.stamp-like');
    const stampNope = card.querySelector('.stamp-nope');
    const stampSuper = card.querySelector('.stamp-superlike');
    const zoomBadge = card.querySelector('.card-zoom-badge');

    if (zoomBadge) {
      zoomBadge.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const currentItem = this.deck[this.currentIndex];
        if (currentItem) this.onImageClickCallback(currentItem);
      };
      zoomBadge.onpointerdown = (e) => {
        e.stopPropagation();
      };
    }

    const onPointerMove = (e) => {
      if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;

      dx = e.clientX - startX;
      dy = e.clientY - startY;
      const dist = Math.hypot(dx, dy);

      if (dist > 6) {
        hasMoved = true;
      }

      // Track rolling points for accurate release velocity
      const now = performance.now();
      positions.push({ x: e.clientX, y: e.clientY, t: now });
      while (positions.length > 1 && (now - positions[0].t) > 100) {
        positions.shift();
      }
      const oldest = positions[0];
      const dt = now - oldest.t;
      if (dt > 10) {
        vx = (e.clientX - oldest.x) / dt;
        vy = (e.clientY - oldest.y) / dt;
      }

      // Physics rotation and position
      const rot = dx * 0.055;
      card.style.transform = `translate3d(${dx}px, ${dy * 0.85}px, 0px) rotate(${rot}deg)`;

      // Dynamic stamp calculation
      const pX = Math.min(Math.abs(dx) / this.THRESHOLD, 1);
      const isSuperlikeGesture = dy < this.SUPERLIKE_THRESHOLD && Math.abs(dx) < 60;

      if (isSuperlikeGesture) {
        const pY = Math.min(Math.abs(dy - this.SUPERLIKE_THRESHOLD) / 60, 1);
        if (stampSuper) stampSuper.style.opacity = String(pY);
        if (stampLike) stampLike.style.opacity = '0';
        if (stampNope) stampNope.style.opacity = '0';
      } else {
        if (stampSuper) stampSuper.style.opacity = '0';
        if (stampLike) stampLike.style.opacity = dx > 0 ? String(pX) : '0';
        if (stampNope) stampNope.style.opacity = dx < 0 ? String(pX) : '0';
      }

      // Next card rises up (anticipation spring)
      const nextCard = this.cardsEl[this.currentIndex + 1];
      if (nextCard) {
        const dragDist = Math.hypot(dx, dy);
        const q = Math.min(dragDist / 160, 1);
        const [y1, s1, r1, o1] = this.SLOTS[1];
        nextCard.style.transform = `translate3d(0px, ${y1 * (1 - q)}px, 0px) scale(${s1 + (1 - s1) * q}) rotate(${r1 * (1 - q)}deg)`;
        nextCard.style.opacity = String(o1 + (1 - o1) * q);
      }
    };

    const cleanUpListeners = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerCancel);
      if (activePointerId !== null) {
        try {
          if (card.releasePointerCapture && card.hasPointerCapture && card.hasPointerCapture(activePointerId)) {
            card.releasePointerCapture(activePointerId);
          }
        } catch (_) {}
      }
      activePointerId = null;
    };

    const onPointerCancel = (e) => {
      if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
      isDragging = false;
      card.classList.remove('is-dragging');
      cleanUpListeners();

      const nextCard = this.cardsEl[this.currentIndex + 1];
      if (nextCard) nextCard.style.transition = '';

      card.style.transition = 'transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease, opacity 0.3s ease';
      this.applySlotTransform(card, this.currentIndex);
      if (nextCard) this.applySlotTransform(nextCard, this.currentIndex + 1);

      if (stampLike) stampLike.style.opacity = '0';
      if (stampNope) stampNope.style.opacity = '0';
      if (stampSuper) stampSuper.style.opacity = '0';
    };

    const onPointerEnd = (e) => {
      if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
      isDragging = false;
      card.classList.remove('is-dragging');
      cleanUpListeners();

      const nextCard = this.cardsEl[this.currentIndex + 1];
      if (nextCard) nextCard.style.transition = '';

      const dragDistance = Math.hypot(dx, dy);
      const duration = performance.now() - startTime;

      // Click / Tap detection on image to open 2K modal zoom
      // Only triggered on genuine stationary taps (movement < 8px, duration < 320ms)
      if (!hasMoved && dragDistance < 8 && duration < 320 && targetIsArtwork) {
        const currentItem = this.deck[this.currentIndex];
        if (currentItem) {
          this.onImageClickCallback(currentItem);
        }
        card.style.transition = 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease';
        this.applySlotTransform(card, this.currentIndex);
        return;
      }

      const isFlick = Math.abs(vx) > this.FLICK && Math.sign(vx) === Math.sign(dx) && Math.abs(dx) > 24;
      const isSuperlike = (dy < this.SUPERLIKE_THRESHOLD && Math.abs(dx) < 75) || (vy < -this.FLICK && dy < -35 && Math.abs(dx) < 65);

      if (isSuperlike) {
        this.swipeAction('superlike', { dy, vx, vy });
      } else if (dx > this.THRESHOLD || (isFlick && dx > 0)) {
        this.swipeAction('right', { dy, vx, vy });
      } else if (dx < -this.THRESHOLD || (isFlick && dx < 0)) {
        this.swipeAction('left', { dy, vx, vy });
      } else {
        // Elastic spring snapback to center
        card.style.transition = 'transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease';
        this.applySlotTransform(card, this.currentIndex);
        if (nextCard) this.applySlotTransform(nextCard, this.currentIndex + 1);

        if (stampLike) stampLike.style.opacity = '0';
        if (stampNope) stampNope.style.opacity = '0';
        if (stampSuper) stampSuper.style.opacity = '0';
      }
    };

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target && e.target.closest('.card-zoom-badge')) return;

      isDragging = true;
      hasMoved = false;
      dx = 0;
      dy = 0;
      vx = 0;
      vy = 0;
      startX = e.clientX;
      startY = e.clientY;
      startTime = performance.now();
      positions = [{ x: e.clientX, y: e.clientY, t: startTime }];
      activePointerId = e.pointerId;
      targetIsArtwork = !!(e.target && (e.target.closest('.card-photo-wrapper') || e.target.closest('.artwork-frame') || e.target.classList.contains('tshirt-artwork')));

      card.classList.add('is-dragging');
      card.style.transition = 'none';

      try {
        if (card.setPointerCapture) card.setPointerCapture(e.pointerId);
      } catch (_) {}

      const nextCard = this.cardsEl[this.currentIndex + 1];
      if (nextCard) nextCard.style.transition = 'none';

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerEnd);
      window.addEventListener('pointercancel', onPointerCancel);
    };

    card.onpointerdown = onPointerDown;
  }

  swipeAction(direction, momentum = null) {
    if (this.currentIndex >= this.cardsEl.length) return;

    const card = this.cardsEl[this.currentIndex];
    const itemData = this.deck[this.currentIndex];

    // Trigger audio & haptic feedback
    if (this.audioHaptics) {
      this.audioHaptics.triggerSwipeFeedback(direction);
    }

    // Stamps
    const stampLike = card.querySelector('.stamp-like');
    const stampNope = card.querySelector('.stamp-nope');
    const stampSuper = card.querySelector('.stamp-superlike');

    let endX = 0;
    let endY = 0;
    let endRot = 0;

    if (direction === 'superlike') {
      if (stampSuper) stampSuper.style.opacity = '1';
      endX = (Math.random() - 0.5) * 100;
      endY = -window.innerHeight * 1.2;
      endRot = (Math.random() - 0.5) * 15;
    } else if (direction === 'right') {
      if (stampLike) stampLike.style.opacity = '1';
      endX = window.innerWidth * 1.35;
      endY = momentum ? momentum.dy * 1.2 : 50;
      endRot = 24;
    } else {
      if (stampNope) stampNope.style.opacity = '1';
      endX = -window.innerWidth * 1.35;
      endY = momentum ? momentum.dy * 1.2 : 50;
      endRot = -24;
    }

    card.classList.remove('is-dragging');
    card.onpointerdown = null;
    card.style.pointerEvents = 'none';
    card.style.zIndex = '5';
    card.style.transition = 'transform 0.52s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease 0.1s';
    card.style.transform = `translate3d(${endX}px, ${endY}px, 0px) rotate(${endRot}deg)`;
    card.style.opacity = '0';

    setTimeout(() => {
      if (card && card.style.opacity === '0') {
        card.style.visibility = 'hidden';
      }
    }, 550);

    // Record vote with positional index for Inverse Propensity Weighting (IPW)
    const voteAction = direction === 'superlike' ? 'superlike' : direction === 'right' ? 'like' : 'pass';
    if (this.analytics) {
      this.analytics.recordVote(itemData, voteAction, this.currentIndex);
    }

    this.history.push({
      index: this.currentIndex,
      direction,
      item: itemData
    });

    this.onVoteCallback({
      item: itemData,
      action: voteAction,
      currentIndex: this.currentIndex,
      totalCards: this.deck.length
    });

    this.currentIndex++;
    this.preloadAhead(this.currentIndex, 4);

    // Re-slot the remaining visible stack (and the newly entering card)
    for (let i = this.currentIndex; i <= this.currentIndex + this.VISIBLE_DEPTH + 1 && i < this.cardsEl.length; i++) {
      this.applySlotTransform(this.cardsEl[i], i);
    }

    if (this.currentIndex < this.cardsEl.length) {
      this.attachDrag(this.cardsEl[this.currentIndex]);
      this.notifyCardChange();
    } else {
      setTimeout(() => {
        this.onDeckEmptyCallback();
      }, 350);
    }
  }

  /**
   * Dynamically re-ranks cards beyond the currently visible stack without shifting visible cards.
   */
  reorderUnseenTail() {
    const splitIndex = this.currentIndex + this.VISIBLE_DEPTH + 1;
    if (splitIndex >= this.deck.length) return;

    const globalStats = this.analytics ? (this.analytics.statsCache || this.analytics.computeLocalStats()) : {};
    const sessionVotes = this.analytics ? this.analytics.sessionVotes : [];

    if (this.orderingEngine && typeof this.orderingEngine.reorderTail === 'function') {
      this.deck = this.orderingEngine.reorderTail(this.deck, splitIndex, globalStats, sessionVotes, this.activeFilter);
    } else if (this.orderingEngine && typeof this.orderingEngine.orderDeck === 'function') {
      const visibleHead = this.deck.slice(0, splitIndex);
      const unseenTail = this.deck.slice(splitIndex);
      const reorderedTail = this.orderingEngine.orderDeck(unseenTail, globalStats, sessionVotes, this.activeFilter);
      this.deck = [...visibleHead, ...reorderedTail];
    }

    // Update DOM elements for the reordered unseen tail so when they slide into view they have the correct artwork and data
    for (let i = splitIndex; i < this.deck.length && i < this.cardsEl.length; i++) {
      this.updateCardElement(this.cardsEl[i], this.deck[i], i);
    }
  }

  /**
   * Updates an existing DOM card element with new item data on queue reordering.
   */
  updateCardElement(card, data, index) {
    if (!card || !data) return;
    card.dataset.index = index;
    card.dataset.id = data.id;
    if (data._orderingMeta && data._orderingMeta.phase) {
      card.dataset.phase = data._orderingMeta.phase;
    }

    const rawSrc = data.image.includes('assets/optimized/') 
      ? data.image 
      : data.image.replace('assets/designs/', 'assets/optimized/').replace(/\.(png|jpg)$/, '.webp');
    const safeSrc = encodeURI(rawSrc);

    const img = card.querySelector('.tshirt-artwork');
    if (img) {
      img.src = safeSrc;
      img.alt = `Studio Varaždin T-Shirt: ${data.title}`;
    }

    const hudCat = card.querySelector('.hud-category');
    if (hudCat) hudCat.textContent = `${(data.category || 'ARTWEAR').toUpperCase()} SERIES`;

    const hudTitle = card.querySelector('.hud-title');
    if (hudTitle) hudTitle.textContent = data.title;
  }

  undo() {
    const last = this.history.pop();
    if (!last) return;

    this.currentIndex = last.index;
    this.preloadAhead(this.currentIndex, 4);
    const card = this.cardsEl[this.currentIndex];

    // Re-enter with spring physics
    card.style.visibility = 'visible';
    card.style.transition = 'none';
    const isSuper = last.direction === 'superlike';
    const isRight = last.direction === 'right';
    const startX = isSuper ? 0 : (isRight ? window.innerWidth * 1.2 : -window.innerWidth * 1.2);
    const startY = isSuper ? -window.innerHeight * 1.2 : 40;

    card.style.transform = `translate3d(${startX}px, ${startY}px, 0px) rotate(${isRight ? 20 : -20}deg)`;
    card.style.opacity = '0';
    void card.offsetWidth; // force reflow

    card.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.35s ease';
    this.applySlotTransform(card, this.currentIndex);

    card.querySelectorAll('.stamp').forEach(st => st.style.opacity = '0');

    // Update remaining slots
    for (let i = this.currentIndex + 1; i <= this.currentIndex + this.VISIBLE_DEPTH + 1 && i < this.cardsEl.length; i++) {
      this.applySlotTransform(this.cardsEl[i], i);
    }

    this.attachDrag(card);
    this.notifyCardChange();

    if (this.audioHaptics) {
      this.audioHaptics.playTap();
    }
  }

  notifyCardChange() {
    const currentItem = this.deck[this.currentIndex] || null;
    this.onCardChangeCallback({
      item: currentItem,
      index: this.currentIndex,
      total: this.deck.length,
      hasUndo: this.history.length > 0
    });
  }

  shuffle() {
    // Re-run dynamic adaptive ordering with fresh stochastic jitter
    const globalStats = this.analytics ? (this.analytics.statsCache || this.analytics.computeLocalStats()) : {};
    const sessionVotes = this.analytics ? this.analytics.sessionVotes : [];
    this.deck = this.orderingEngine.orderDeck(this.catalog, globalStats, sessionVotes, this.activeFilter);
    this.renderDeck();
  }
}
