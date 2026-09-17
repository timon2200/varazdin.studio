/**
 * Studio Varaždin — Compare Engine (1-on-1 King of the Hill Duel)
 * Ultra-minimalist, bold, high-contrast typography, zero-fluff pairwise comparison.
 * Zero external dependencies — pure Vanilla ES6 module.
 */

export class CompareEngine {
  constructor(options = {}) {
    this.container = options.container;
    this.catalog = options.catalog || [];
    this.analytics = options.analytics;
    this.audioHaptics = options.audioHaptics;
    this.onVoteCallback = options.onVote || (() => {});
    this.onImageClickCallback = options.onImageClick || (() => {});
    this.showToast = options.showToast || (() => {});
    this.resolveImageUrl = options.resolveImageUrl || ((item) => item.image || '');

    this.activeFilter = 'ALL';
    this.deck = [];
    this.queue = [];
    this.leftItem = null;
    this.rightItem = null;
    this.winnerSide = null; // 'left' | 'right' | null
    this.leftStreak = 0;
    this.rightStreak = 0;
    this.matchupIndex = 1;
    this.totalInitialDeckSize = 0;
    this.history = [];
    this.isAnimating = false;
    this.isCompleted = false;

    this.categories = [
      'ALL', 'Selected', 'City', 'Studio', 'Creative', 
      'Garda', 'Towers', 'Utility', 'Artwear', 'Front Hits', 'Experimental'
    ];
  }

  /**
   * Initialize a new comparison deck for a given category filter.
   */
  setDeck(catalog, filter = 'ALL') {
    this.catalog = catalog || this.catalog;
    this.activeFilter = filter;
    this.history = [];
    this.winnerSide = null;
    this.leftStreak = 0;
    this.rightStreak = 0;
    this.matchupIndex = 1;
    this.isAnimating = false;
    this.isCompleted = false;

    let filtered = [...this.catalog];
    if (filter !== 'ALL') {
      filtered = filtered.filter(it => (it.category || '').toLowerCase() === filter.toLowerCase());
    }

    if (filtered.length < 2) {
      this.renderEmptyState(filtered.length);
      return;
    }

    // Shuffle deck
    this.deck = this.shuffleArray([...filtered]);
    this.totalInitialDeckSize = this.deck.length;

    // First card on Left, second on Right
    this.leftItem = this.deck[0];
    this.rightItem = this.deck[1];
    this.queue = this.deck.slice(2);

    this.renderArena();
  }

  shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  renderEmptyState(count) {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="duel-empty-card">
        <h3 class="duel-empty-title">NEDOVOLJNO MOTIVA</h3>
        <p class="duel-empty-sub">Kategorija [${this.activeFilter}] ima samo ${count} motiv. Potrebno je barem 2.</p>
        <button class="duel-pill-btn active" id="btnDuelResetFilter">PRIKAŽI SVE</button>
      </div>
    `;
    const btn = this.container.querySelector('#btnDuelResetFilter');
    if (btn) {
      btn.addEventListener('click', () => this.setDeck(this.catalog, 'ALL'));
    }
  }

  renderArena() {
    if (!this.container || !this.leftItem || !this.rightItem) return;

    // Update Counter badge in header bar if present
    const duelCounterEl = document.getElementById('duelCounter');
    if (duelCounterEl) {
      duelCounterEl.textContent = `#${this.matchupIndex} · ${this.queue.length} PREOSTALO`;
    }

    const stackLayer3 = this.queue.length >= 3 ? '<div class="duel-deck-stack-layer stack-layer-3"></div>' : '';
    const stackLayer2 = this.queue.length >= 2 ? '<div class="duel-deck-stack-layer stack-layer-2"></div>' : '';
    const stackLayer1 = this.queue.length >= 1 ? '<div class="duel-deck-stack-layer stack-layer-1"></div>' : '';

    this.container.innerHTML = `
      <!-- Main 1-on-1 Battle Arena Grid (Dual Deck Stack) -->
      <div class="duel-arena-grid">
        
        <!-- Left Card Slot (Left Deck Stack) -->
        <div class="duel-card-slot slot-left" id="slotLeft">
          ${stackLayer3}
          ${stackLayer2}
          ${stackLayer1}
          ${this.createCardHtml(this.leftItem, 'left')}
        </div>

        <!-- Minimalist VS Separator -->
        <div class="duel-vs-box">
          <span class="duel-vs-text">VS</span>
        </div>

        <!-- Right Card Slot (Right Deck Stack) -->
        <div class="duel-card-slot slot-right" id="slotRight">
          ${stackLayer3}
          ${stackLayer2}
          ${stackLayer1}
          ${this.createCardHtml(this.rightItem, 'right')}
        </div>

      </div>
    `;

    this.bindArenaEvents();
  }

  createCardHtml(item, side) {
    if (!item) return '';

    const isChampion = this.winnerSide === side;
    const streak = isChampion ? (side === 'left' ? this.leftStreak : this.rightStreak) : 0;
    const optSrc = this.resolveImageUrl(item);
    const keyHint = side === 'left' ? 'MAKNI [ ← ]' : 'MAKNI [ → ]';

    return `
      <article class="duel-card ${isChampion ? 'is-champion' : ''}" data-side="${side}" data-id="${item.id}">
        
        ${isChampion ? `<div class="duel-crown-badge">👑 DEFENDING ${streak > 1 ? `(${streak}x)` : ''}</div>` : ''}

        <!-- Big Hero Visual Container -->
        <div class="duel-img-wrap" title="Klikni ili povuci za uklanjanje (${side === 'left' ? '←' : '→'})">
          <img src="${optSrc}" alt="${item.title}" class="duel-img" draggable="false" loading="eager">
          <div class="scanline-overlay"></div>
          
          <div class="duel-key-hint">${keyHint}</div>
          
          <button class="duel-zoom-btn" title="2K Zoom" aria-label="Zoom" type="button">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
        </div>

        <!-- Bold Condensed Title -->
        <div class="duel-card-meta">
          <h2 class="duel-title-condensed">${item.title}</h2>
        </div>

      </article>
    `;
  }

  bindArenaEvents() {
    const slotLeft = this.container.querySelector('#slotLeft');
    const slotRight = this.container.querySelector('#slotRight');
    const cardLeft = slotLeft ? slotLeft.querySelector('.duel-card') : null;
    const cardRight = slotRight ? slotRight.querySelector('.duel-card') : null;

    if (cardLeft) {
      const zoomBtn = cardLeft.querySelector('.duel-zoom-btn');
      if (zoomBtn) {
        zoomBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.onImageClickCallback(this.leftItem);
        });
        zoomBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      }
      this.attachCardGestures(cardLeft, 'left');
    }

    if (cardRight) {
      const zoomBtn = cardRight.querySelector('.duel-zoom-btn');
      if (zoomBtn) {
        zoomBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.onImageClickCallback(this.rightItem);
        });
        zoomBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      }
      this.attachCardGestures(cardRight, 'right');
    }
  }

  /**
   * Attach high-performance pointer drag / swipe / click gesture to a duel card.
   * Swiping or clicking a card marks it for removal (discard), keeping the other defending.
   */
  attachCardGestures(card, side) {
    if (!card) return;

    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dy = 0;
    let isDragging = false;
    let hasMoved = false;
    let startTime = 0;
    let activePointerId = null;

    const onPointerDown = (e) => {
      if (this.isAnimating) return;
      if (e.target.closest('.duel-zoom-btn')) return;
      if (e.button !== undefined && e.button !== 0) return;

      startX = e.clientX;
      startY = e.clientY;
      startTime = performance.now();
      dx = 0;
      dy = 0;
      isDragging = true;
      hasMoved = false;
      activePointerId = e.pointerId;

      try {
        if (card.setPointerCapture) card.setPointerCapture(e.pointerId);
      } catch (_) {}

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerEnd);
      window.addEventListener('pointercancel', onPointerCancel);
    };

    const onPointerMove = (e) => {
      if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;

      dx = e.clientX - startX;
      dy = e.clientY - startY;
      const dist = Math.hypot(dx, dy);

      if (dist > 8) {
        hasMoved = true;
        card.classList.add('is-dragging');
      }

      if (hasMoved) {
        if (e.cancelable) e.preventDefault();
        const rot = dx * 0.045;
        card.style.transform = `translate3d(${dx}px, ${dy}px, 0px) rotate(${rot}deg)`;
        const opacityRatio = Math.max(0.35, 1 - dist / 360);
        card.style.opacity = String(opacityRatio);
      }
    };

    const cleanUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerCancel);
      if (activePointerId !== null) {
        try {
          if (card.releasePointerCapture && card.hasPointerCapture(activePointerId)) {
            card.releasePointerCapture(activePointerId);
          }
        } catch (_) {}
      }
      activePointerId = null;
    };

    const onPointerCancel = () => {
      if (!isDragging) return;
      isDragging = false;
      card.classList.remove('is-dragging');
      cleanUp();
      card.style.transition = 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.25s ease';
      card.style.transform = '';
      card.style.opacity = '';
    };

    const onPointerEnd = (e) => {
      if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
      isDragging = false;
      card.classList.remove('is-dragging');
      cleanUp();

      const dist = Math.hypot(dx, dy);
      const duration = performance.now() - startTime;
      const velocity = dist / Math.max(duration, 1);

      // Swipe away in ANY direction or fast flick -> discard!
      if (hasMoved && (dist > 50 || velocity > 0.32)) {
        this.discardCard(side, { dx, dy });
      } else if (!hasMoved || dist < 12) {
        // Direct click / tap on card -> discard this card!
        this.discardCard(side);
      } else {
        // Spring back if drag was cancelled/too small
        card.style.transition = 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.25s ease';
        card.style.transform = '';
        card.style.opacity = '';
      }
    };

    card.addEventListener('pointerdown', onPointerDown);
  }

  /**
   * User discards a card (side = 'left' | 'right').
   * The other card becomes/remains the defending champion.
   */
  async discardCard(side, dragVector = null) {
    if (this.isAnimating || !this.leftItem || !this.rightItem) return;
    this.isAnimating = true;

    const loserSide = side;
    const winnerSide = side === 'left' ? 'right' : 'left';
    const loserItem = side === 'left' ? this.leftItem : this.rightItem;
    const winnerItem = side === 'left' ? this.rightItem : this.leftItem;

    // Push previous state onto history stack
    this.history.push({
      leftItem: this.leftItem,
      rightItem: this.rightItem,
      winnerSide: this.winnerSide,
      leftStreak: this.leftStreak,
      rightStreak: this.rightStreak,
      queue: [...this.queue],
      matchupIndex: this.matchupIndex,
      winnerId: winnerItem.id,
      loserId: loserItem.id
    });

    // Update streaks
    if (winnerSide === 'left') {
      this.leftStreak = (this.winnerSide === 'left' ? this.leftStreak : 0) + 1;
      this.rightStreak = 0;
      this.winnerSide = 'left';
    } else {
      this.rightStreak = (this.winnerSide === 'right' ? this.rightStreak : 0) + 1;
      this.leftStreak = 0;
      this.winnerSide = 'right';
    }

    // Audio Haptic
    if (this.audioHaptics) {
      this.audioHaptics.playSwipe('pass');
    }

    // Telemetry
    if (this.analytics) {
      await this.analytics.recordVote(winnerItem, 'like');
      await this.analytics.recordVote(loserItem, 'pass');
    }

    this.onVoteCallback({ winnerItem, loserItem, winnerSide, loserSide });

    // Animate cards
    const loserSlot = side === 'left' ? this.container.querySelector('#slotLeft') : this.container.querySelector('#slotRight');
    const winnerSlot = side === 'left' ? this.container.querySelector('#slotRight') : this.container.querySelector('#slotLeft');
    const loserCard = loserSlot ? loserSlot.querySelector('.duel-card') : null;
    const winnerCard = winnerSlot ? winnerSlot.querySelector('.duel-card') : null;

    if (winnerCard) {
      winnerCard.classList.remove('anim-winner-pulse');
      void winnerCard.offsetWidth;
      winnerCard.classList.add('anim-winner-pulse');
    }

    if (loserCard) {
      loserCard.classList.add('is-discarding');
      loserCard.style.pointerEvents = 'none';

      if (dragVector && Math.hypot(dragVector.dx, dragVector.dy) > 10) {
        // Drag gesture fling along user's flick vector
        const dist = Math.hypot(dragVector.dx, dragVector.dy);
        const factor = Math.max(3.5, 900 / (dist || 1));
        const endX = dragVector.dx * factor;
        const endY = dragVector.dy * factor;
        const endRot = Math.max(-35, Math.min(35, dragVector.dx * 0.08));

        loserCard.style.transition = 'transform 0.44s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease, box-shadow 0.3s ease';
        loserCard.style.transform = `translate3d(${endX}px, ${endY}px, 0px) rotate(${endRot}deg) scale(0.9)`;
        loserCard.style.opacity = '0';
      } else {
        // Click or Arrow Key: dramatic directional fly away!
        // Left card flies left (MAKNI [ ← ]), Right card flies right (MAKNI [ → ])
        const flyToLeft = (side === 'left');
        const screenW = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const flyDistance = Math.max(screenW * 0.85, 850);
        const endX = flyToLeft ? -flyDistance : flyDistance;
        const endY = -50;
        const endRot = flyToLeft ? -26 : 26;

        loserCard.style.transition = 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.36s ease 0.04s, box-shadow 0.3s ease';
        loserCard.style.transform = `translate3d(${endX}px, ${endY}px, 0px) rotate(${endRot}deg) scale(0.92)`;
        loserCard.style.opacity = '0';
      }
    }

    const currentStreak = winnerSide === 'left' ? this.leftStreak : this.rightStreak;
    this.showToast(currentStreak > 1 ? `👑 ${currentStreak}x ${winnerItem.title}` : `✕ Maknuto: ${loserItem.title}`);

    setTimeout(() => {
      if (this.queue.length > 0) {
        const nextChallenger = this.queue.shift();
        this.matchupIndex++;

        if (loserSide === 'left') {
          this.leftItem = nextChallenger;
        } else {
          this.rightItem = nextChallenger;
        }

        this.renderArena();

        const newSlot = loserSide === 'left' ? this.container.querySelector('#slotLeft') : this.container.querySelector('#slotRight');
        const newCard = newSlot ? newSlot.querySelector('.duel-card') : null;
        if (newCard) {
          newCard.classList.add('anim-card-enter');
        }

        this.isAnimating = false;
      } else {
        this.handleDeckComplete(winnerItem, currentStreak);
      }
    }, 390);
  }

  /**
   * Backwards compatible selector
   */
  selectWinner(winnerSide) {
    const loserSide = winnerSide === 'left' ? 'right' : 'left';
    return this.discardCard(loserSide);
  }

  undo() {
    if (this.isAnimating || this.history.length === 0) return;
    const prevState = this.history.pop();

    this.leftItem = prevState.leftItem;
    this.rightItem = prevState.rightItem;
    this.winnerSide = prevState.winnerSide;
    this.leftStreak = prevState.leftStreak;
    this.rightStreak = prevState.rightStreak;
    this.queue = prevState.queue;
    this.matchupIndex = prevState.matchupIndex;

    if (this.audioHaptics) {
      this.audioHaptics.playClick();
    }

    this.renderArena();
    this.showToast('⤾ UNDO');
  }

  skipPair() {
    if (this.isAnimating) return;
    if (this.queue.length >= 2) {
      this.history.push({
        leftItem: this.leftItem,
        rightItem: this.rightItem,
        winnerSide: this.winnerSide,
        leftStreak: this.leftStreak,
        rightStreak: this.rightStreak,
        queue: [...this.queue],
        matchupIndex: this.matchupIndex
      });

      this.leftItem = this.queue.shift();
      this.rightItem = this.queue.shift();
      this.winnerSide = null;
      this.leftStreak = 0;
      this.rightStreak = 0;
      this.matchupIndex++;

      if (this.audioHaptics) this.audioHaptics.playClick();
      this.renderArena();
      this.showToast('⇆ SKIP');
    } else {
      this.showToast('⚠️ Kraj špila');
    }
  }

  restart() {
    this.setDeck(this.catalog, this.activeFilter);
    if (this.audioHaptics) this.audioHaptics.playClick();
    this.showToast('↺ RESTART');
  }

  handleDeckComplete(ultimateWinner, finalStreak) {
    this.isCompleted = true;
    this.isAnimating = false;
    if (!this.container) return;

    const optSrc = this.resolveImageUrl(ultimateWinner);
    const cat = (ultimateWinner.category || 'ARTWEAR').toUpperCase();

    this.container.innerHTML = `
      <div class="duel-completion-card">
        <div class="completion-crown-glow">👑</div>
        <span class="duel-tag-mono duel-gold-text">FINAL CHAMPION</span>
        <h2 class="duel-title-condensed" style="font-size:2rem;">${ultimateWinner.title}</h2>
        
        <div class="duel-champion-showcase">
          <div class="showcase-img-box" id="btnShowcaseZoom" title="2K Zoom">
            <img src="${optSrc}" alt="${ultimateWinner.title}">
            <div class="scanline-overlay"></div>
          </div>
          <div class="duel-tag-mono duel-gold-text" style="padding:4px 10px; background:var(--accent-gold-bg); border-radius:4px;">
            🔥 ${finalStreak} WINS IN A ROW
          </div>
        </div>

        <div class="duel-actions-mini" style="margin-top:1rem; gap:12px;">
          <button id="btnRestartCompletedDuel" class="duel-pill-btn active" style="padding:10px 20px; font-size:0.9rem;">
            ↺ PONOVNO
          </button>
          
          <button id="btnDuelViewLeaderboard" class="duel-pill-btn" style="padding:10px 20px; font-size:0.9rem;">
            🏆 RANG LISTA
          </button>
        </div>
      </div>
    `;

    const btnZoom = this.container.querySelector('#btnShowcaseZoom');
    if (btnZoom) {
      btnZoom.addEventListener('click', () => this.onImageClickCallback(ultimateWinner));
    }

    const btnRestart = this.container.querySelector('#btnRestartCompletedDuel');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => this.restart());
    }

    const btnLeaderboard = this.container.querySelector('#btnDuelViewLeaderboard');
    if (btnLeaderboard) {
      btnLeaderboard.addEventListener('click', () => {
        const btnHeaderLB = document.getElementById('btnHeaderLeaderboard');
        if (btnHeaderLB) btnHeaderLB.click();
      });
    }
  }
}
