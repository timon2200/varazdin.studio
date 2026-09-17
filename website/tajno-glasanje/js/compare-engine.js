/**
 * Studio Varaždin — Compare Engine (1-on-1 King of the Hill Duel)
 * Pairwise elimination matchup system with 60fps animations, streak tracking, and undo support.
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

    this.initDOM();
  }

  initDOM() {
    if (!this.container) return;
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

    // Shuffle deck intelligently using Fisher-Yates with balanced entropy
    this.deck = this.shuffleArray([...filtered]);
    this.totalInitialDeckSize = this.deck.length;

    // First card on Left (initial champion), second on Right (first challenger)
    this.leftItem = this.deck[0];
    this.rightItem = this.deck[1];
    this.queue = this.deck.slice(2);

    this.renderArena();
    this.updateHUD();
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
        <div style="font-size: 2.2rem; margin-bottom: 0.75rem;">⚔️</div>
        <h3 class="empty-title">NEDOVOLJNO MOTIVA ZA DVOBOJ</h3>
        <p class="empty-sub">Za usporedbu je potrebno barem 2 motiva. Odabrana kategorija (${this.activeFilter}) ima ${count} motiva.</p>
        <button class="duel-btn-restart" id="btnDuelResetFilter">PRIKAŽI SVE KATEGORIJE</button>
      </div>
    `;
    const btn = this.container.querySelector('#btnDuelResetFilter');
    if (btn) {
      btn.addEventListener('click', () => {
        this.setDeck(this.catalog, 'ALL');
        const catNav = document.getElementById('duelCategoryNav');
        if (catNav) {
          catNav.querySelectorAll('.cat-pill').forEach(b => b.classList.toggle('active', b.dataset.cat === 'ALL'));
        }
      });
    }
  }

  renderArena() {
    if (!this.container) return;

    this.container.innerHTML = `
      <!-- Duel HUD & Stats Topbar -->
      <div class="duel-hud-card">
        <div class="duel-hud-left">
          <div class="duel-pill-counter">
            <span class="live-dot" aria-hidden="true"></span>
            <span>DVOBOJ <strong id="duelCurrentIndex">#${this.matchupIndex}</strong></span>
          </div>
          <span class="duel-remaining-badge" id="duelRemainingCount">Preostalo izazivača: ${this.queue.length}</span>
        </div>

        <div class="duel-hud-center">
          <div id="duelReigningStreakBadge" class="duel-streak-banner ${this.winnerSide ? 'active' : ''}">
            ${this.getReigningStreakText()}
          </div>
        </div>

        <div class="duel-hud-right">
          <button id="btnDuelUndo" class="duel-tool-btn" title="Vrati prethodni dvoboj (U)" ${this.history.length === 0 ? 'disabled' : ''}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6"></path>
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
            </svg>
            <span>VRATI</span>
          </button>
          
          <button id="btnDuelSkip" class="duel-tool-btn" title="Preskoči oba motiva (Space)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="13 17 18 12 13 7"></polyline>
              <polyline points="6 17 11 12 6 7"></polyline>
            </svg>
            <span>PRESKOČI</span>
          </button>

          <button id="btnDuelRestart" class="duel-tool-btn" title="Promiješaj i kreni iznova">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              <polyline points="1 4 1 10 7 10"></polyline>
            </svg>
            <span>PROMIJEŠAJ</span>
          </button>
        </div>
      </div>

      <!-- Main 1-on-1 Battle Arena -->
      <div class="duel-arena-grid">
        
        <!-- Left Fighter Slot -->
        <div class="duel-card-slot slot-left" id="slotLeft">
          ${this.createCardHtml(this.leftItem, 'left')}
        </div>

        <!-- Center VS Matrix Divider -->
        <div class="duel-vs-divider">
          <div class="duel-vs-badge">
            <span class="vs-glow"></span>
            <span class="vs-text">VS</span>
          </div>
          <div class="duel-kbd-hints">
            <span>[ A / ← ]</span>
            <span style="opacity:0.4;">·</span>
            <span>[ D / → ]</span>
          </div>
        </div>

        <!-- Right Fighter Slot -->
        <div class="duel-card-slot slot-right" id="slotRight">
          ${this.createCardHtml(this.rightItem, 'right')}
        </div>

      </div>

      <!-- Quick Tips Bar -->
      <div class="duel-footer-hints">
        <span>💡 SAVJET: Odaberi bolju karticu klikom ili tipkama <strong>A</strong> (Lijeva) / <strong>D</strong> (Desna). Pobjednik ostaje na mjestu i brani naslov!</span>
      </div>
    `;

    this.bindArenaEvents();
  }

  getReigningStreakText() {
    if (!this.winnerSide) {
      return `⚔️ PRVI DVOBOJ · ODABERI POBJEDNIKA`;
    }
    const currentStreak = this.winnerSide === 'left' ? this.leftStreak : this.rightStreak;
    const championItem = this.winnerSide === 'left' ? this.leftItem : this.rightItem;
    const title = championItem ? championItem.title : 'Branitelj';
    
    if (currentStreak <= 1) {
      return `👑 NOVI BRANITELJ: <strong>${title}</strong> (1 POBJEDA)`;
    } else if (currentStreak >= 5) {
      return `🔥 NEZAUSTAVLJIV NIZ: <strong>${title}</strong> (👑 ${currentStreak} POBJEDA ZAREDOM!)`;
    } else {
      return `👑 BRANITELJ NASLOVA: <strong>${title}</strong> (${currentStreak} POBJEDE ZAREDOM)`;
    }
  }

  createCardHtml(item, side) {
    if (!item) return '';

    const isChampion = this.winnerSide === side;
    const streak = isChampion ? (side === 'left' ? this.leftStreak : this.rightStreak) : 0;
    const isChallenger = this.winnerSide && !isChampion;
    const optSrc = this.resolveImageUrl(item);
    const cat = (item.category || 'ARTWEAR').toUpperCase();

    const badgeHtml = isChampion 
      ? `<div class="duel-card-crown-banner"><span class="crown-icon">👑</span> BRANITELJ NASLOVA ${streak > 1 ? `· ${streak} POBJEDE` : ''}</div>`
      : isChallenger 
        ? `<div class="duel-card-challenger-banner"><span class="bolt-icon">⚡</span> IZAZIVAČ</div>`
        : `<div class="duel-card-initial-banner">⚔️ KANDIDAT</div>`;

    const keyHint = side === 'left' ? 'A / ←' : 'D / →';

    return `
      <article class="duel-card ${isChampion ? 'is-champion' : ''} ${isChallenger ? 'is-challenger' : ''}" data-side="${side}" data-id="${item.id}">
        
        <!-- Header Tag Bar -->
        <div class="duel-card-header">
          <span class="card-tag ${cat === 'SELECTED' ? 'badge-gold' : cat === 'CITY' ? 'badge-blue' : 'badge-green'}">[ ${cat} ]</span>
          <span class="duel-card-id">#${item.id || 'sv'}</span>
        </div>

        ${badgeHtml}

        <!-- Image Container with Click-to-Zoom -->
        <div class="duel-card-image-wrap" title="Klikni za 2K zoom pregled">
          <img src="${optSrc}" alt="${item.title}" class="duel-card-img" loading="eager">
          <div class="scanline-overlay"></div>
          <button class="duel-zoom-overlay-btn" title="Otvori 2K punu sliku" aria-label="2K Zoom">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
        </div>

        <!-- Info & Description -->
        <div class="duel-card-info">
          <span class="duel-cat-sub">${cat} SERIES · cCc</span>
          <h3 class="duel-card-title">${item.title}</h3>
          <p class="duel-card-desc">${item.description || 'Autorski Studio Varaždin street-wear dizajn.'}</p>
        </div>

        <!-- Huge Tactile Choice CTA Button -->
        <div class="duel-card-action-bar">
          <button class="duel-btn-choose duel-btn-choose-${side}" data-side="${side}">
            <span class="btn-choose-icon">${side === 'left' ? '👈' : '👉'}</span>
            <span class="btn-choose-text">BOLJA MI JE OVA</span>
            <span class="btn-choose-kbd">${keyHint}</span>
          </button>
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

    // Clicking anywhere on Left Card or its choose button chooses Left
    if (slotLeft) {
      slotLeft.addEventListener('click', (e) => {
        if (e.target.closest('.duel-zoom-overlay-btn')) {
          e.stopPropagation();
          this.onImageClickCallback(this.leftItem);
          return;
        }
        this.selectWinner('left');
      });
    }

    // Clicking anywhere on Right Card or its choose button chooses Right
    if (slotRight) {
      slotRight.addEventListener('click', (e) => {
        if (e.target.closest('.duel-zoom-overlay-btn')) {
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

    // Update streaks and king of the hill state
    if (side === 'left') {
      this.leftStreak = (this.winnerSide === 'left' ? this.leftStreak : 0) + 1;
      this.rightStreak = 0;
      this.winnerSide = 'left';
    } else {
      this.rightStreak = (this.winnerSide === 'right' ? this.rightStreak : 0) + 1;
      this.leftStreak = 0;
      this.winnerSide = 'right';
    }

    // Trigger Audio Haptic
    if (this.audioHaptics) {
      this.audioHaptics.playSwipe('like');
    }

    // Record Telemetry Votes
    if (this.analytics) {
      await this.analytics.recordVote(winnerItem, 'like');
      await this.analytics.recordVote(loserItem, 'pass');
    }

    this.onVoteCallback({ winnerItem, loserItem, side });

    // Execute 60fps animations
    const slotLeft = this.container.querySelector('#slotLeft');
    const slotRight = this.container.querySelector('#slotRight');
    const winnerSlot = side === 'left' ? slotLeft : slotRight;
    const loserSlot = side === 'left' ? slotRight : slotLeft;

    if (winnerSlot) {
      winnerSlot.classList.remove('anim-winner-pulse');
      void winnerSlot.offsetWidth; // force reflow
      winnerSlot.classList.add('anim-winner-pulse');
    }

    if (loserSlot) {
      loserSlot.classList.remove('anim-exit-left', 'anim-exit-right');
      void loserSlot.offsetWidth;
      loserSlot.classList.add(side === 'left' ? 'anim-exit-right' : 'anim-exit-left');
    }

    const currentStreak = side === 'left' ? this.leftStreak : this.rightStreak;
    if (currentStreak === 1) {
      this.showToast(`👑 Novi branitelj: ${winnerItem.title}`);
    } else {
      this.showToast(`🔥 ${currentStreak}. pobjeda zaredom: ${winnerItem.title}!`);
    }

    // Wait for exit animation to finish before bringing the next challenger
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

        // Animate entrance of the new challenger
        const newSlot = side === 'left' ? this.container.querySelector('#slotRight') : this.container.querySelector('#slotLeft');
        if (newSlot) {
          newSlot.classList.add(side === 'left' ? 'anim-enter-right' : 'anim-enter-left');
        }

        this.updateHUD();
        this.isAnimating = false;
      } else {
        // Deck completed! Celebrate the Grand Champion
        this.handleDeckComplete(winnerItem, currentStreak);
      }
    }, 280);
  }

  /**
   * Undo the last duel decision.
   */
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
    this.updateHUD();
    this.showToast('⤾ Vraćeno na prethodni dvoboj');
  }

  /**
   * Skip current pair and draw two fresh cards.
   */
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
      this.updateHUD();
      this.showToast('⇆ Izvučena dva nova motiva');
    } else {
      this.showToast('⚠️ Nema dovoljno preostalih motiva u špilu.');
    }
  }

  /**
   * Restart the duel deck.
   */
  restart() {
    this.setDeck(this.catalog, this.activeFilter);
    if (this.audioHaptics) this.audioHaptics.playClick();
    this.showToast('↺ Špil promiješan i ponovno pokrenut!');
  }

  updateHUD() {
    const currentIndexEl = document.getElementById('duelCurrentIndex');
    const remainingEl = document.getElementById('duelRemainingCount');
    const streakEl = document.getElementById('duelReigningStreakBadge');
    const btnUndo = document.getElementById('btnDuelUndo');

    if (currentIndexEl) currentIndexEl.textContent = `#${this.matchupIndex}`;
    if (remainingEl) remainingEl.textContent = `Preostalo izazivača: ${this.queue.length}`;
    if (streakEl) {
      streakEl.innerHTML = this.getReigningStreakText();
      streakEl.className = `duel-streak-banner ${this.winnerSide ? 'active' : ''}`;
    }
    if (btnUndo) {
      btnUndo.disabled = this.history.length === 0;
    }
  }

  /**
   * End of deck coronation ceremony.
   */
  handleDeckComplete(ultimateWinner, finalStreak) {
    this.isCompleted = true;
    this.isAnimating = false;
    if (!this.container) return;

    const optSrc = this.resolveImageUrl(ultimateWinner);
    const cat = (ultimateWinner.category || 'ARTWEAR').toUpperCase();

    this.container.innerHTML = `
      <div class="duel-completion-card">
        <div class="completion-crown-glow">👑</div>
        <span class="completion-eyebrow">KRAJ TURNIRA · SVI IZAZIVAČI SU SUČELJENI</span>
        <h2 class="completion-headline">VRHOVNI POBJEDNIK DVOBOJA</h2>
        
        <div class="duel-champion-showcase">
          <div class="showcase-img-box" id="btnShowcaseZoom" title="Klikni za 2K zoom">
            <img src="${optSrc}" alt="${ultimateWinner.title}">
            <div class="scanline-overlay"></div>
          </div>
          <div class="showcase-info">
            <span class="card-tag badge-gold">[ ${cat} ]</span>
            <h3 class="showcase-title">${ultimateWinner.title}</h3>
            <p class="showcase-desc">${ultimateWinner.description || 'Pobjednički Studio Varaždin street-wear motiv.'}</p>
            <div class="showcase-streak-pill">
              🔥 OBRANIO TRON KROZ ${finalStreak} POBJEDA ZAREDOM!
            </div>
          </div>
        </div>

        <div class="duel-completion-actions">
          <button id="btnRestartCompletedDuel" class="share-btn share-btn-gold">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              <polyline points="1 4 1 10 7 10"></polyline>
            </svg>
            PROMIJEŠAJ & IGRAJ PONOVO
          </button>
          
          <button id="btnDuelViewLeaderboard" class="share-btn share-btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            POGLEDAJ RANG LISTU UŽIVO
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
