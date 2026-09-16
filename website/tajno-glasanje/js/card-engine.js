/**
 * Studio Varaždin — Card Engine (Tinder-style 3D Physics Swiper)
 * 60fps gesture-driven swipe stack with modern linear() spring curves and dynamic adaptive ordering.
 */

import { DynamicDeckOrdering } from './deck-ordering.js';

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

    this.deck = [];
    this.cardsEl = [];
    this.currentIndex = 0;
    this.history = [];
    this.isDragging = false;
    this.activeFilter = 'ALL';

    // Physics tuning constants
    this.THRESHOLD = 85;       // px to trigger swipe
    this.SUPERLIKE_THRESHOLD = -110; // px upward to trigger superlike
    this.FLICK = 0.48;         // px/ms velocity flick threshold
    this.VISIBLE_DEPTH = 3;    // number of cards visible in depth stack

    // Stack transform matrix [y-offset px, scale, rotation deg, opacity]
    this.SLOTS = [
      [0, 1.0, 0, 1.0],
      [12, 0.965, 3.5, 0.94],
      [24, 0.93, -3.5, 0.82],
      [36, 0.895, 1.5, 0.45]
    ];

    this.SHADOWS = [
      '0 28px 45px rgba(0, 0, 0, 0.75), 0 8px 16px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.12)',
      '0 20px 30px rgba(0, 0, 0, 0.65), 0 4px 10px rgba(0, 0, 0, 0.45)',
      '0 14px 22px rgba(0, 0, 0, 0.55)',
      '0 8px 14px rgba(0, 0, 0, 0.4)'
    ];

    this.initKeyboard();
  }

  initKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (this.currentIndex >= this.cardsEl.length) return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        this.swipeAction('left');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        this.swipeAction('right');
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        this.swipeAction('superlike');
      } else if (e.key === 'u' || e.key === 'U' || (e.ctrlKey && e.key === 'z')) {
        e.preventDefault();
        this.undo();
      }
    });
  }

  setDeck(items, filter = 'ALL') {
    this.activeFilter = filter;
    
    // Compute dynamic order using UCB1 + Exploitation + Session Affinity + Category Diversity
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

      // Use optimized WebP image with safe URL encoding
      const rawSrc = data.image.includes('assets/optimized/') 
        ? data.image 
        : data.image.replace('assets/designs/', 'assets/optimized/').replace(/\.(png|jpg)$/, '.webp');
      const safeSrc = encodeURI(rawSrc);
      const isImmediate = index < 4;

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
            </div>
            
            <!-- Dynamic Interaction Stamps -->
            <div class="stamp stamp-like"><span class="stamp-text">SVIĐA MI SE</span></div>
            <div class="stamp stamp-nope"><span class="stamp-text">NE</span></div>
            <div class="stamp stamp-superlike"><span class="stamp-text">★ SUPERLIKE ★</span></div>
          </div>

          <!-- Bottom Card Meta HUD -->
          <div class="card-hud">
            <div class="card-hud-left">
              <span class="hud-category">${data.category.toUpperCase()} SERIES</span>
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
    if (diff < 0) return;

    const slotIndex = Math.min(diff, this.SLOTS.length - 1);
    const [y, scale, rot, opacity] = this.SLOTS[slotIndex];

    card.style.transformOrigin = '50% 90%';
    card.style.transform = `translate3d(0px, ${y}px, 0px) scale(${scale}) rotate(${rot}deg)`;
    card.style.opacity = diff > this.VISIBLE_DEPTH ? '0' : String(opacity);
    card.style.boxShadow = this.SHADOWS[slotIndex];
    card.style.pointerEvents = diff === 0 ? 'auto' : 'none';
  }

  attachDrag(card) {
    if (!card) return;

    let startX = 0, startY = 0;
    let dx = 0, dy = 0;
    let lastX = 0, lastT = 0, vx = 0;
    let isDragging = false;

    const stampLike = card.querySelector('.stamp-like');
    const stampNope = card.querySelector('.stamp-nope');
    const stampSuper = card.querySelector('.stamp-superlike');

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      isDragging = true;
      dx = 0;
      dy = 0;
      vx = 0;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastT = performance.now();

      card.classList.add('is-dragging');
      card.style.transition = 'none';
      if (card.setPointerCapture) card.setPointerCapture(e.pointerId);

      const nextCard = this.cardsEl[this.currentIndex + 1];
      if (nextCard) nextCard.style.transition = 'none';
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      dx = e.clientX - startX;
      dy = e.clientY - startY;

      const now = performance.now();
      const dt = now - lastT;
      if (dt > 12) {
        vx = (e.clientX - lastX) / dt;
        lastX = e.clientX;
        lastT = now;
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
        const q = Math.min(dragDist / 180, 1);
        const [y1, s1, r1, o1] = this.SLOTS[1];
        nextCard.style.transform = `translate3d(0px, ${y1 * (1 - q)}px, 0px) scale(${s1 + (1 - s1) * q}) rotate(${r1 * (1 - q)}deg)`;
        nextCard.style.opacity = String(o1 + (1 - o1) * q);
      }
    };

    const onPointerEnd = (e) => {
      if (!isDragging) return;
      isDragging = false;
      card.classList.remove('is-dragging');
      if (e.pointerId !== undefined && card.hasPointerCapture && card.hasPointerCapture(e.pointerId)) {
        card.releasePointerCapture(e.pointerId);
      }

      const nextCard = this.cardsEl[this.currentIndex + 1];
      if (nextCard) nextCard.style.transition = '';

      const isFlick = Math.abs(vx) > this.FLICK && Math.sign(vx) === Math.sign(dx) && Math.abs(dx) > 30;
      const isSuperlike = dy < this.SUPERLIKE_THRESHOLD && Math.abs(dx) < 70;

      if (isSuperlike) {
        this.swipeAction('superlike', { dy, vx });
      } else if (dx > this.THRESHOLD || (isFlick && dx > 0)) {
        this.swipeAction('right', { dy, vx });
      } else if (dx < -this.THRESHOLD || (isFlick && dx < 0)) {
        this.swipeAction('left', { dy, vx });
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

    card.onpointerdown = onPointerDown;
    card.onpointermove = onPointerMove;
    card.onpointerup = onPointerEnd;
    card.onpointercancel = onPointerEnd;
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
    card.style.transition = 'transform 0.52s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease 0.1s';
    card.style.transform = `translate3d(${endX}px, ${endY}px, 0px) rotate(${endRot}deg)`;
    card.style.opacity = '0';
    card.style.pointerEvents = 'none';

    // Record vote
    const voteAction = direction === 'superlike' ? 'superlike' : direction === 'right' ? 'like' : 'pass';
    if (this.analytics) {
      this.analytics.recordVote(itemData, voteAction);
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

    // Dynamic Tail Re-ordering: Adapt the unseen cards in the queue to newly learned user preferences
    if (this.currentIndex % 3 === 0 && this.currentIndex + this.VISIBLE_DEPTH < this.deck.length) {
      this.reorderUnseenTail();
    }

    // Re-slot the remaining visible stack
    for (let i = this.currentIndex; i <= this.currentIndex + this.VISIBLE_DEPTH && i < this.cardsEl.length; i++) {
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

    const visibleHead = this.deck.slice(0, splitIndex);
    const unseenTail = this.deck.slice(splitIndex);

    const globalStats = this.analytics ? (this.analytics.statsCache || this.analytics.computeLocalStats()) : {};
    const sessionVotes = this.analytics ? this.analytics.sessionVotes : [];

    const reorderedTail = this.orderingEngine.orderDeck(unseenTail, globalStats, sessionVotes, this.activeFilter);
    this.deck = [...visibleHead, ...reorderedTail];
  }

  undo() {
    const last = this.history.pop();
    if (!last) return;

    this.currentIndex = last.index;
    this.preloadAhead(this.currentIndex, 4);
    const card = this.cardsEl[this.currentIndex];

    // Re-enter with spring physics
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
    for (let i = this.currentIndex + 1; i <= this.currentIndex + this.VISIBLE_DEPTH && i < this.cardsEl.length; i++) {
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
