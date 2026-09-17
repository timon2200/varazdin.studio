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

    const streakCount = this.winnerSide === 'left' ? this.leftStreak : this.winnerSide === 'right' ? this.rightStreak : 0;
    const isStreak = streakCount > 1;

    this.container.innerHTML = `
      <!-- Main 1-on-1 Battle Arena Grid -->
      <div class="duel-arena-grid">
        
        <!-- Left Card Slot -->
        <div class="duel-card-slot slot-left" id="slotLeft">
          ${this.createCardHtml(this.leftItem, 'left')}
        </div>

        <!-- Minimalist VS Separator -->
        <div class="duel-vs-box">
          <span class="duel-vs-text">VS</span>
        </div>

        <!-- Right Card Slot -->
        <div class="duel-card-slot slot-right" id="slotRight">
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
    const keyHint = side === 'left' ? 'A' : 'D';

    return `
      <article class="duel-card ${isChampion ? 'is-champion' : ''}" data-side="${side}" data-id="${item.id}">
        
        ${isChampion ? `<div class="duel-crown-badge">👑 DEFENDING ${streak > 1 ? `(${streak}x)` : ''}</div>` : ''}

        <!-- Big Hero Visual Container -->
        <div class="duel-img-wrap" title="Klikni za odabir (${keyHint})">
          <img src="${optSrc}" alt="${item.title}" class="duel-img" loading="eager">
          <div class="scanline-overlay"></div>
          
          <div class="duel-key-hint">${keyHint}</div>
          
          <button class="duel-zoom-btn" title="2K Zoom" aria-label="Zoom">
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
    const btnUndo = this.container.querySelector('#btnDuelUndo');
    const btnSkip = this.container.querySelector('#btnDuelSkip');
    const btnRestart = this.container.querySelector('#btnDuelRestart');
    const catNav = this.container.querySelector('#duelCategoryNav');

    if (catNav) {
      catNav.addEventListener('click', (e) => {
        const btn = e.target.closest('.duel-pill-btn');
        if (!btn) return;
        const cat = btn.dataset.cat || 'ALL';
        this.setDeck(this.catalog, cat);
        if (this.audioHaptics) this.audioHaptics.playClick();
      });
    }

    if (slotLeft) {
      slotLeft.addEventListener('click', (e) => {
        if (e.target.closest('.duel-zoom-btn')) {
          e.stopPropagation();
          this.onImageClickCallback(this.leftItem);
          return;
        }
        this.selectWinner('left');
      });
    }

    if (slotRight) {
      slotRight.addEventListener('click', (e) => {
        if (e.target.closest('.duel-zoom-btn')) {
          e.stopPropagation();
          this.onImageClickCallback(this.rightItem);
          return;
        }
        this.selectWinner('right');
      });
    }

    if (btnUndo) {
      btnUndo.addEventListener('click', () => this.undo());
    }

    if (btnSkip) {
      btnSkip.addEventListener('click', () => this.skipPair());
    }

    if (btnRestart) {
      btnRestart.addEventListener('click', () => this.restart());
    }
  }

  /**
   * User selects the winning card ('left' | 'right').
   */
  async selectWinner(side) {
    if (this.isAnimating || !this.leftItem || !this.rightItem) return;
    this.isAnimating = true;

    const winnerItem = side === 'left' ? this.leftItem : this.rightItem;
    const loserItem = side === 'left' ? this.rightItem : this.leftItem;

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
    if (side === 'left') {
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
      this.audioHaptics.playSwipe('like');
    }

    // Telemetry
    if (this.analytics) {
      await this.analytics.recordVote(winnerItem, 'like');
      await this.analytics.recordVote(loserItem, 'pass');
    }

    this.onVoteCallback({ winnerItem, loserItem, side });

    // Execute animations
    const slotLeft = this.container.querySelector('#slotLeft');
    const slotRight = this.container.querySelector('#slotRight');
    const winnerSlot = side === 'left' ? slotLeft : slotRight;
    const loserSlot = side === 'left' ? slotRight : slotLeft;

    if (winnerSlot) {
      winnerSlot.classList.remove('anim-winner-pulse');
      void winnerSlot.offsetWidth;
      winnerSlot.classList.add('anim-winner-pulse');
    }

    if (loserSlot) {
      loserSlot.classList.remove('anim-exit-left', 'anim-exit-right');
      void loserSlot.offsetWidth;
      loserSlot.classList.add(side === 'left' ? 'anim-exit-right' : 'anim-exit-left');
    }

    const currentStreak = side === 'left' ? this.leftStreak : this.rightStreak;
    this.showToast(currentStreak > 1 ? `👑 ${currentStreak}x ${winnerItem.title}` : `✓ ${winnerItem.title}`);

    setTimeout(() => {
      if (this.queue.length > 0) {
        const nextChallenger = this.queue.shift();
        this.matchupIndex++;

        if (side === 'left') {
          this.rightItem = nextChallenger;
        } else {
          this.leftItem = nextChallenger;
        }

        this.renderArena();

        const newSlot = side === 'left' ? this.container.querySelector('#slotRight') : this.container.querySelector('#slotLeft');
        if (newSlot) {
          newSlot.classList.add(side === 'left' ? 'anim-enter-right' : 'anim-enter-left');
        }

        this.isAnimating = false;
      } else {
        this.handleDeckComplete(winnerItem, currentStreak);
      }
    }, 240);
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
