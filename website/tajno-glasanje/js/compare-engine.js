import { globalCommentsManager } from './comments-manager.js';
import { globalCommentTooltip } from './comment-tooltip.js';

export class CompareEngine {
  constructor(options = {}) {
    this.container = options.container;
    this.catalog = options.catalog || [];
    this.analytics = options.analytics;
    this.audioHaptics = options.audioHaptics;
    this.commentsManager = options.commentsManager || globalCommentsManager;
    this.onVoteCallback = options.onVote || (() => {});
    this.onImageClickCallback = options.onImageClick || (() => {});
    this.showToast = options.showToast || (() => {});
    this.resolveImageUrl = options.resolveImageUrl || ((item) => item.image || '');

    // Listen for comment updates
    if (typeof window !== 'undefined') {
      window.addEventListener('sv-comments-updated', () => {
        this.refreshCommentBadges();
      });
    }

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

    // Advanced Tournament & Elo Dynamics
    this.eloMap = new Map(); // id -> Elo rating (baseline 1200)
    this.matchStatsMap = new Map(); // id -> { wins, losses, peakStreak, points }
    this.redemptionPool = []; // Fallen champions with streak >= 3 eligible for podium
    this.longestStreakRecord = { item: null, streak: 0 };
    this.biggestUpsetRecord = { winner: null, loser: null, bounty: 0, streakEnded: 0 };

    this.categories = [
      'ALL', 'Selected', 'City', 'Studio', 'Creative', 
      'Garda', 'Towers', 'Utility', 'Artwear', 'Front Hits', 'Experimental'
    ];
  }

  /**
   * Initializes or gets Elo rating for an item.
   */
  getElo(item) {
    if (!item) return 1200;
    if (!this.eloMap.has(item.id)) {
      // Baseline initialization with prior approval boost
      const likes = item.likes || 0;
      const superlikes = item.superlikes || 0;
      const passes = item.passes || 0;
      const total = likes + superlikes + passes;
      let initElo = 1200;
      if (total > 0) {
        const rate = (likes + superlikes * 2) / (total * 2);
        initElo = Math.round(1050 + (rate * 300));
      }
      this.eloMap.set(item.id, initElo);
    }
    return this.eloMap.get(item.id);
  }

  /**
   * Evaluates narrative match context between defending champion & challenger.
   */
  evaluateMatchContext(champion, challenger, streak) {
    if (!champion || streak === 0) {
      return {
        phase: 'calibration',
        label: '⚖️ KALIBRACIJA UKUSA',
        subtitle: 'Početno profiliranje estetskog pravca',
        badgeClass: 'context-calibration'
      };
    }

    const champCat = (champion.category || '').toUpperCase();
    const chalCat = (challenger.category || '').toUpperCase();
    const chalPower = challenger._duelMeta ? challenger._duelMeta.power : 0.5;

    if (streak >= 6 || chalPower >= 0.82) {
      return {
        phase: 'apex',
        label: '👑 APEX FINALE · BOSS GAUNTLET',
        subtitle: `Šampion ${streak}x u nizu protiv #1 nositelja`,
        badgeClass: 'context-apex'
      };
    }

    if (streak >= 4 || chalPower >= 0.68) {
      return {
        phase: 'heavyweight',
        label: '⚔️ TEŠKA KATEGORIJA · ELITNI IZAZIVAČ',
        subtitle: 'Top 15% rangirana autorska grafika',
        badgeClass: 'context-heavyweight'
      };
    }

    if (streak === 1 && champCat === chalCat) {
      return {
        phase: 'genre_derby',
        label: `⚔️ ŽANROVSKI DERBI · [${champion.category || 'KATEGORIJA'}]`,
        subtitle: 'Obračun za vodeći dizajn u istom stilu',
        badgeClass: 'context-derby'
      };
    }

    if (streak >= 2 && champCat !== chalCat) {
      return {
        phase: 'style_contrast',
        label: `⚡ STILSKI KONTRAST · [${champion.category || 'A'} vs ${challenger.category || 'B'}]`,
        subtitle: 'Sučeljavanje oprečnih vizualnih jezika',
        badgeClass: 'context-contrast'
      };
    }

    if (chalCat === champCat) {
      return {
        phase: 'genre_derby',
        label: `⚔️ ŽANROVSKI DERBI · [${champion.category || 'KATEGORIJA'}]`,
        subtitle: 'Obračun za vodeći dizajn u istom stilu',
        badgeClass: 'context-derby'
      };
    }

    return {
      phase: 'contender',
      label: '⚡ DVOBOJ IZAZIVAČA',
      subtitle: 'Borba za prevlast na tronu',
      badgeClass: 'context-contender'
    };
  }

  /**
   * Updates Bradley-Terry / Elo ratings, tournament points, and tracks upset bounties.
   */
  updateEloAndPoints(winnerItem, loserItem, streak, matchContext) {
    const winnerId = winnerItem.id;
    const loserId = loserItem.id;
    const rW = this.getElo(winnerItem);
    const rL = this.getElo(loserItem);

    // Expected probability
    const eW = 1 / (1 + Math.pow(10, (rL - rW) / 400));
    const eL = 1 - eW;

    // Dynamic K-factor with streak scaling (high streak = high stakes)
    const kFactor = 32 * (1 + 0.20 * Math.min(streak, 6));

    // Base deltas
    let deltaW = Math.round(kFactor * (1 - eW));
    let deltaL = Math.round(kFactor * (0 - eL));

    // Upset detection (Underdog defeated champion with streak >= 3 or higher rating)
    let isUpset = false;
    let upsetBounty = 0;
    if (streak >= 3 || (rL - rW) >= 40) {
      isUpset = true;
      upsetBounty = Math.round((streak * 22) + Math.max(0, (rL - rW) * 0.3));
      deltaW += upsetBounty;

      if (!this.biggestUpsetRecord.winner || upsetBounty > this.biggestUpsetRecord.bounty) {
        this.biggestUpsetRecord = {
          winner: winnerItem,
          loser: loserItem,
          bounty: upsetBounty,
          streakEnded: streak
        };
      }
    }

    const newRW = Math.max(800, rW + deltaW);
    const newRL = Math.max(800, rL + deltaL);
    this.eloMap.set(winnerId, newRW);
    this.eloMap.set(loserId, newRL);

    // Match stats map
    const wStats = this.matchStatsMap.get(winnerId) || { wins: 0, losses: 0, peakStreak: 0, points: 0 };
    const lStats = this.matchStatsMap.get(loserId) || { wins: 0, losses: 0, peakStreak: 0, points: 0 };

    wStats.wins += 1;
    wStats.peakStreak = Math.max(wStats.peakStreak, streak);
    lStats.losses += 1;

    // Tournament points
    let matchPts = 10;
    if (matchContext && matchContext.phase === 'genre_derby') matchPts = 15;
    else if (matchContext && matchContext.phase === 'heavyweight') matchPts = 25 * Math.max(1, streak);
    else if (matchContext && matchContext.phase === 'apex') matchPts = 40 * Math.max(1, streak);
    if (isUpset) matchPts += 50;

    wStats.points += matchPts;
    this.matchStatsMap.set(winnerId, wStats);
    this.matchStatsMap.set(loserId, lStats);

    // Longest streak
    if (streak > this.longestStreakRecord.streak) {
      this.longestStreakRecord = { item: winnerItem, streak };
    }

    // Save to Redemption Pool if fallen champion had streak >= 3
    if (isUpset && streak >= 3) {
      this.redemptionPool.push({
        item: loserItem,
        peakStreak: streak,
        finalElo: newRL,
        wins: lStats.wins
      });
    }

    return {
      eloGain: deltaW,
      eloLoss: deltaL,
      isUpset,
      upsetBounty,
      pointsAwarded: matchPts,
      newWinnerElo: newRW,
      newLoserElo: newRL
    };
  }

  /**
   * Compute multi-factor Strength / Power Score P(i) in [0, 1] for items in catalog.
   * Incorporates Bayesian posterior quality mean (Beta-Bernoulli conjugate prior),
   * global/local approval rates, editorial/flagship tier boost, and personal session favorites.
   */
  computePowerScores(items = []) {
    const scores = new Map();
    const userFavorites = this.analytics && typeof this.analytics.getUserFavorites === 'function'
      ? this.analytics.getUserFavorites()
      : [];
    const favoriteIds = new Set(userFavorites.map(f => f.id));
    const superlikeIds = new Set(userFavorites.filter(f => f.isSuperlike).map(f => f.id));

    // Bayesian prior pseudo-counts (Dirichlet / Beta prior)
    const priorAlpha = 2.0;
    const priorBeta = 2.0;

    items.forEach(item => {
      const likes = item.likes || 0;
      const superlikes = item.superlikes || 0;
      const passes = item.passes || 0;
      const total = likes + superlikes + passes;

      // 1. Bayesian Posterior Quality (Beta-Bernoulli mean with Dirichlet-weighted Superlikes)
      const effectiveLikes = likes + (superlikes * 2.8);
      const alpha = effectiveLikes + priorAlpha;
      const beta = (passes * 1.2) + priorBeta;
      const bayesianQuality = alpha / (alpha + beta); // Expected quality mean in [0.2, 0.95]

      // 2. Empirical Approval Rate
      const approvalRate = total > 0 ? (likes + superlikes) / total : 0.5;

      // 3. Editorial & Flagship Tier Pedigree Boost
      let editorialBoost = 0;
      const slug = (item.slug || '').toLowerCase();
      const title = (item.title || '').toLowerCase();
      const category = (item.category || '').toUpperCase();

      if (category === 'SELECTED') {
        editorialBoost += 0.25;
      }
      if (slug.includes('silent_knight') || slug.includes('creative_block') || title.includes('silent knight')) {
        editorialBoost += 0.35;
      } else if (slug.includes('maker') || slug.includes('inspired_by_craft') || slug.includes('attention_cash')) {
        editorialBoost += 0.25;
      } else if (slug.includes('front') || slug.includes('sigil') || slug.includes('monolith')) {
        editorialBoost += 0.15;
      }

      // 4. Personal User Conviction (Superlikes / Likes from active session)
      let userAffinityBoost = 0;
      if (superlikeIds.has(item.id)) {
        userAffinityBoost += 0.40;
      } else if (favoriteIds.has(item.id)) {
        userAffinityBoost += 0.20;
      }

      // Composite Power Score normalized to [0, 1]
      const rawPower = (0.45 * bayesianQuality) + (0.25 * approvalRate) + (0.15 * editorialBoost) + (0.15 * userAffinityBoost);
      scores.set(item.id, Math.min(1.0, Math.max(0.05, rawPower)));
    });

    return scores;
  }

  /**
   * Determines the difficulty tier of a challenger given champion's streak & challenger power.
   */
  getChallengerTier(defendingStreak, powerScore = 0.5) {
    if (defendingStreak >= 5 || powerScore >= 0.82) {
      return {
        level: 'apex',
        label: '🔥 APEX SUPARNIK',
        sublabel: 'Vrhunski dvoboj',
        badgeClass: 'tier-apex'
      };
    } else if (defendingStreak >= 3 || powerScore >= 0.68) {
      return {
        level: 'elite',
        label: '⚔️ ELITNI IZAZIVAČ',
        sublabel: 'Teška kategorija',
        badgeClass: 'tier-elite'
      };
    } else if (defendingStreak >= 2 || powerScore >= 0.55) {
      return {
        level: 'heavyweight',
        label: '⚡ TEŠKA KATEGORIJA',
        sublabel: 'Glavni konkurent',
        badgeClass: 'tier-heavyweight'
      };
    }
    return null;
  }

  /**
   * Adaptive Streak-Escalation Matchmaking Engine:
   * Dynamically reorders candidateQueue so that index 0 contains the optimal next challenger
   * based on the defending champion's streak, power escalation, style rivalry, and diversity.
   */
  reorderQueueForMatchup(champion, streak, candidateQueue = null) {
    const pool = candidateQueue ? [...candidateQueue] : [...this.queue];
    if (pool.length <= 1) return pool;

    const powerMap = this.computePowerScores(pool);

    // If no champion (initial opener or skip), sort candidates by composite power
    if (!champion || streak === 0) {
      pool.sort((a, b) => (powerMap.get(b.id) || 0) - (powerMap.get(a.id) || 0));
      return pool;
    }

    // Recent opponent categories to enforce cognitive diversity and anti-fatigue
    const recentOpponentCategories = this.history
      .slice(-3)
      .map(h => {
        const opp = h.winnerId === h.leftItem.id ? h.rightItem : h.leftItem;
        return (opp.category || '').toUpperCase();
      });

    const champCat = (champion.category || '').toUpperCase();
    const champSlug = (champion.slug || '').toLowerCase();
    const champTags = Array.isArray(champion.tags) ? champion.tags.map(t => t.toLowerCase()) : [];
    const isChampLight = champSlug.includes('white') || champSlug.includes('cream') || champSlug.includes('light');

    // Escalation weights based on streak k:
    // k = 1: Warmup & broad test (wPower = 0.40)
    // k = 2: Contender test (wPower = 0.60)
    // k = 3: Heavyweight test (wPower = 0.76)
    // k = 4: Elite Boss (wPower = 0.88)
    // k >= 5: Apex Boss Showdown (wPower = 0.96)
    const wPower = Math.min(0.96, 0.40 + (streak * 0.12));
    const wRival = streak <= 3 ? 0.32 : 0.14; // Early streaks test intra-genre dominance
    const wContrast = streak >= 4 ? 0.26 : 0.10; // Late streaks test apex cross-genre contrast

    const scoredCandidates = pool.map(item => {
      const power = powerMap.get(item.id) || 0.5;
      const itemCat = (item.category || '').toUpperCase();
      const itemSlug = (item.slug || '').toLowerCase();
      const itemTags = Array.isArray(item.tags) ? item.tags.map(t => t.toLowerCase()) : [];
      const isItemLight = itemSlug.includes('white') || itemSlug.includes('cream') || itemSlug.includes('light');

      // 1. Style Rivalry (Intra-genre clash)
      let rivalry = 0;
      if (itemCat === champCat) rivalry += 0.6;
      let commonTags = 0;
      itemTags.forEach(t => { if (champTags.includes(t)) commonTags++; });
      if (commonTags > 0) rivalry += Math.min(0.4, commonTags * 0.2);

      // 2. Dramatic Contrast (Light vs Dark, Category contrast for Boss stages)
      let contrast = 0;
      if (isItemLight !== isChampLight) contrast += 0.5;
      if (itemCat !== champCat) contrast += 0.5;

      // 3. Cognitive Anti-Repetition Penalty (Avoid 3 identical categories in a row)
      let repetitionPenalty = 0;
      const recentSameCount = recentOpponentCategories.filter(c => c === itemCat).length;
      if (recentSameCount >= 2) repetitionPenalty = 0.45;
      else if (recentSameCount === 1) repetitionPenalty = 0.15;

      // Composite match suitability score
      const matchSuitability = 
        (wPower * power) +
        (wRival * rivalry) +
        (wContrast * contrast) -
        repetitionPenalty;

      return {
        item,
        power,
        matchSuitability,
        tier: this.getChallengerTier(streak, power)
      };
    });

    // Softmax temperature: as streak increases, temperature drops sharply
    // Streak 1: tau = 0.35 (broad exploration)
    // Streak 3: tau = 0.20 (focused on high tier)
    // Streak 5+: tau = 0.08 (almost deterministic heavyweight)
    const tau = Math.max(0.08, 0.40 - (streak * 0.065));

    // Sort by matchSuitability descending
    scoredCandidates.sort((a, b) => b.matchSuitability - a.matchSuitability);

    // Pick candidate from top tier slice via Gibbs/Softmax sampling
    const topCandidateTierSize = Math.max(1, Math.min(scoredCandidates.length, streak >= 5 ? 2 : streak >= 3 ? 4 : 6));
    const candidateSlice = scoredCandidates.slice(0, topCandidateTierSize);

    const maxScore = candidateSlice[0].matchSuitability;
    const exps = candidateSlice.map(c => Math.exp((c.matchSuitability - maxScore) / tau));
    const sumExps = exps.reduce((sum, v) => sum + v, 0);
    const probs = exps.map(v => v / (sumExps || 1));

    let rand = Math.random();
    let cum = 0;
    let pickedIndex = 0;
    for (let i = 0; i < candidateSlice.length; i++) {
      cum += probs[i];
      if (rand <= cum || i === candidateSlice.length - 1) {
        pickedIndex = i;
        break;
      }
    }

    const nextChallengerEntry = candidateSlice[pickedIndex];
    // Attach duel matchmaking metadata
    nextChallengerEntry.item._duelMeta = {
      tier: nextChallengerEntry.tier,
      power: nextChallengerEntry.power,
      matchSuitability: nextChallengerEntry.matchSuitability,
      defendingStreak: streak
    };

    // Construct reordered pool: selected challenger at index 0, followed by remainder sorted by suitability
    const remaining = scoredCandidates.filter(c => c.item.id !== nextChallengerEntry.item.id);
    const reordered = [nextChallengerEntry.item, ...remaining.map(c => c.item)];

    return reordered;
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
    if (filter !== 'ALL' && filter !== 'Selected') {
      filtered = filtered.filter(it => (it.category || '').toLowerCase() === filter.toLowerCase());
    }

    if (filtered.length < 2) {
      this.renderEmptyState(filtered.length);
      return;
    }

    this.totalInitialDeckSize = filtered.length;

    // Compute power scores
    const powerMap = this.computePowerScores(filtered);
    const sortedByPower = [...filtered].sort((a, b) => (powerMap.get(b.id) || 0) - (powerMap.get(a.id) || 0));

    // Select 2 distinctive high-appeal opening candidates
    const opener1 = sortedByPower[0];
    let opener2 = sortedByPower[1];

    // Try to pick opener2 from a different category or contrasting tone for maximum opening impact
    const cat1 = (opener1.category || '').toUpperCase();
    const contrastingOpener = sortedByPower.slice(1, 6).find(it => (it.category || '').toUpperCase() !== cat1);
    if (contrastingOpener) {
      opener2 = contrastingOpener;
    }

    this.leftItem = opener1;
    this.rightItem = opener2;

    // Initialize Elo ratings for catalog
    filtered.forEach(it => this.getElo(it));

    // Reset tournament session records
    this.redemptionPool = [];
    this.longestStreakRecord = { item: null, streak: 0 };
    this.biggestUpsetRecord = { winner: null, loser: null, bounty: 0, streakEnded: 0 };

    // Remaining items form the queue
    const remaining = filtered.filter(it => it.id !== opener1.id && it.id !== opener2.id);
    this.queue = this.reorderQueueForMatchup(null, 0, remaining);

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

    const activeStreak = this.winnerSide === 'left' ? this.leftStreak : (this.winnerSide === 'right' ? this.rightStreak : 0);
    const defendingChamp = this.winnerSide === 'left' ? this.leftItem : (this.winnerSide === 'right' ? this.rightItem : null);
    const activeChallenger = this.winnerSide === 'left' ? this.rightItem : (this.winnerSide === 'right' ? this.leftItem : this.rightItem);
    const matchContext = this.evaluateMatchContext(defendingChamp, activeChallenger, activeStreak);

    // Update Counter badge in header bar if present
    const duelCounterEl = document.getElementById('duelCounter');
    if (duelCounterEl) {
      duelCounterEl.textContent = `#${this.matchupIndex} · ${this.queue.length} PREOSTALO`;
    }

    const nextChallenger = this.queue.length > 0 ? this.queue[0] : null;
    const stackLayer3 = this.queue.length >= 3 ? '<div class="duel-deck-stack-layer stack-layer-3"></div>' : '';
    const stackLayer2 = this.queue.length >= 2 ? '<div class="duel-deck-stack-layer stack-layer-2"></div>' : '';
    const underlyingLeft = nextChallenger ? this.createUnderlyingCardHtml(nextChallenger, 'left') : '';
    const underlyingRight = nextChallenger ? this.createUnderlyingCardHtml(nextChallenger, 'right') : '';

    this.container.innerHTML = `
      <!-- Contextual Match Header Banner -->
      <div class="duel-match-context-bar">
        <div class="duel-match-context-tag ${matchContext.badgeClass}">
          <span class="context-pill-title">${matchContext.label}</span>
          <span class="context-pill-sub">${matchContext.subtitle}</span>
        </div>
      </div>

      <!-- Main 1-on-1 Battle Arena Grid (Dual Deck Stack) -->
      <div class="duel-arena-grid">
        
        <!-- Left Card Slot (Left Deck Stack) -->
        <div class="duel-card-slot slot-left" id="slotLeft">
          ${stackLayer3}
          ${stackLayer2}
          ${underlyingLeft}
          ${this.createCardHtml(this.leftItem, 'left')}
        </div>

        <!-- Stylized 3D VS Separator -->
        <div class="duel-vs-box" aria-hidden="true">
          <img src="assets/vs-graphic.png" class="duel-vs-img" alt="VS" draggable="false">
        </div>

        <!-- Right Card Slot (Right Deck Stack) -->
        <div class="duel-card-slot slot-right" id="slotRight">
          ${stackLayer3}
          ${stackLayer2}
          ${underlyingRight}
          ${this.createCardHtml(this.rightItem, 'right')}
        </div>

      </div>
    `;

    this.bindArenaEvents();
  }

  getKeyHintHtml(side) {
    const isLeft = side === 'left';
    const arrowSvg = isLeft
      ? `<svg class="bold-arrow-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`
      : `<svg class="bold-arrow-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;

    return `<span>MAKNI</span> <span class="duel-key-bracket">[</span> ${arrowSvg} <span class="duel-key-bracket">]</span>`;
  }

  createUnderlyingCardHtml(item, side) {
    if (!item) return '';
    const optSrc = this.resolveImageUrl(item);
    const keyHint = this.getKeyHintHtml(side);

    // Compute preview tier if opposing side is defending champion
    const opposingStreak = side === 'left' ? this.rightStreak : this.leftStreak;
    const isOpponentChampion = side === 'left' ? this.winnerSide === 'right' : this.winnerSide === 'left';
    const previewTier = isOpponentChampion ? this.getChallengerTier(opposingStreak, (item._duelMeta && item._duelMeta.power) || 0.6) : null;
    const elo = this.getElo(item);

    return `
      <div class="duel-underlying-card" data-side="${side}">
        ${previewTier ? `<div class="duel-underlying-tier-tag ${previewTier.badgeClass}">${previewTier.label}</div>` : `<div class="duel-underlying-elo-tag">⚡ ${elo}</div>`}

        <!-- Big Hero Visual Container -->
        <div class="duel-img-wrap">
          <img src="${optSrc}" alt="${item.title}" class="duel-img" draggable="false" loading="eager">
          <div class="scanline-overlay"></div>
          <div class="duel-key-hint">${keyHint}</div>
        </div>

        <!-- Bold Condensed Title -->
        <div class="duel-card-meta">
          <h2 class="duel-title-condensed">${item.title}</h2>
        </div>
      </div>
    `;
  }

  createCardHtml(item, side) {
    if (!item) return '';

    const isChampion = this.winnerSide === side;
    const streak = isChampion ? (side === 'left' ? this.leftStreak : this.rightStreak) : 0;
    
    // Challenger tier calculation
    const isChallenger = this.winnerSide !== null && this.winnerSide !== side;
    const defendingStreak = isChallenger ? (side === 'left' ? this.rightStreak : this.leftStreak) : 0;
    const challengerPower = (item._duelMeta && item._duelMeta.power) || 0.6;
    const challengerTier = isChallenger ? this.getChallengerTier(defendingStreak, challengerPower) : null;
    const itemElo = this.getElo(item);

    const optSrc = this.resolveImageUrl(item);
    const keyHint = this.getKeyHintHtml(side);
    const hasComment = this.commentsManager ? this.commentsManager.hasComment(item.id) : false;

    return `
      <article class="duel-card ${isChampion ? 'is-champion' : ''} ${challengerTier ? challengerTier.badgeClass : ''}" data-side="${side}" data-id="${item.id}">
        
        ${isChampion ? `<div class="duel-crown-badge">👑 DEFENDING ${streak > 1 ? `(${streak}x)` : ''} · 🔥 ${itemElo} ELO</div>` : ''}
        ${challengerTier ? `<div class="duel-challenger-badge ${challengerTier.badgeClass}">${challengerTier.label} · ⚡ ${itemElo} ELO</div>` : (!isChampion ? `<div class="duel-elo-badge">⚡ ${itemElo} ELO</div>` : '')}

        <!-- Big Hero Visual Container -->
        <div class="duel-img-wrap" title="Klikni ili povuci za uklanjanje (${side === 'left' ? '←' : '→'})">
          <img src="${optSrc}" alt="${item.title}" class="duel-img" draggable="false" loading="eager">
          <div class="scanline-overlay"></div>
          
          <div class="duel-key-hint">${keyHint}</div>
        </div>

        <!-- Bold Condensed Title -->
        <div class="duel-card-meta">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
            <h2 class="duel-title-condensed">${item.title}</h2>
            ${hasComment ? `<span class="card-comment-indicator" title="Otvori bilješku">💬 BILJEŠKA</span>` : ''}
          </div>
        </div>

      </article>
    `;
  }

  refreshCommentBadges() {
    if (!this.container) return;
    const cardLeft = this.container.querySelector('#slotLeft .duel-card');
    const cardRight = this.container.querySelector('#slotRight .duel-card');

    [ { card: cardLeft, item: this.leftItem }, { card: cardRight, item: this.rightItem } ].forEach(({ card, item }) => {
      if (!card || !item) return;
      const meta = card.querySelector('.duel-card-meta > div');
      let indicator = card.querySelector('.card-comment-indicator');
      const hasComment = this.commentsManager ? this.commentsManager.hasComment(item.id) : false;

      if (hasComment) {
        if (!indicator && meta) {
          indicator = document.createElement('span');
          indicator.className = 'card-comment-indicator';
          indicator.title = 'Otvori bilješku';
          indicator.textContent = '💬 BILJEŠKA';
          indicator.addEventListener('click', (e) => {
            e.stopPropagation();
            globalCommentTooltip.open(item, { x: e.clientX, y: e.clientY });
          });
          meta.appendChild(indicator);
        }
      } else if (indicator) {
        indicator.remove();
      }
    });
  }

  bindArenaEvents() {
    const slotLeft = this.container.querySelector('#slotLeft');
    const slotRight = this.container.querySelector('#slotRight');
    const cardLeft = slotLeft ? slotLeft.querySelector('.duel-card') : null;
    const cardRight = slotRight ? slotRight.querySelector('.duel-card') : null;

    if (cardLeft) {
      this.attachCardGestures(cardLeft, 'left');
      const commentBadge = cardLeft.querySelector('.card-comment-indicator');
      if (commentBadge) {
        commentBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          globalCommentTooltip.open(this.leftItem, { x: e.clientX, y: e.clientY });
        });
      }
    }

    if (cardRight) {
      this.attachCardGestures(cardRight, 'right');
      const commentBadge = cardRight.querySelector('.card-comment-indicator');
      if (commentBadge) {
        commentBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          globalCommentTooltip.open(this.rightItem, { x: e.clientX, y: e.clientY });
        });
      }
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
    let holdDelayTimer = null;
    let holdChargeTimer = null;
    let holdIndicatorEl = null;
    let isHoldCompleted = false;

    const item = side === 'left' ? this.leftItem : this.rightItem;
    const slot = side === 'left' ? this.container.querySelector('#slotLeft') : this.container.querySelector('#slotRight');
    const underlyingCard = slot ? slot.querySelector('.duel-underlying-card') : null;

    const removeHoldIndicator = () => {
      if (holdDelayTimer) {
        clearTimeout(holdDelayTimer);
        holdDelayTimer = null;
      }
      if (holdChargeTimer) {
        clearTimeout(holdChargeTimer);
        holdChargeTimer = null;
      }
      if (holdIndicatorEl && holdIndicatorEl.parentNode) {
        holdIndicatorEl.remove();
      }
      holdIndicatorEl = null;
      card.classList.remove('is-holding');
    };

    const onPointerDown = (e) => {
      if (this.isAnimating) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('.card-comment-indicator')) return;

      startX = e.clientX;
      startY = e.clientY;
      startTime = performance.now();
      dx = 0;
      dy = 0;
      isDragging = true;
      hasMoved = false;
      isHoldCompleted = false;
      activePointerId = e.pointerId;
      card.classList.remove('is-idle-teasing');

      // Start Long-Press Hold Detection with 0.5s Silent Delay
      removeHoldIndicator();

      holdDelayTimer = setTimeout(() => {
        if (!isDragging || hasMoved) return;
        card.classList.add('is-holding');

        holdIndicatorEl = document.createElement('div');
        holdIndicatorEl.className = 'card-charge-indicator';
        holdIndicatorEl.style.left = `${startX}px`;
        holdIndicatorEl.style.top = `${startY}px`;
        holdIndicatorEl.innerHTML = `
          <div class="charge-meter-wrap">
            <svg class="charge-svg" viewBox="0 0 48 48">
              <circle class="charge-bg-circle" cx="24" cy="24" r="20"></circle>
              <circle class="charge-progress-circle" cx="24" cy="24" r="20"></circle>
            </svg>
            <div class="charge-center-icon">💬</div>
          </div>
          <div class="charge-label-chip">DRŽI ZA BILJEŠKU</div>
        `;
        document.body.appendChild(holdIndicatorEl);

        const circle = holdIndicatorEl.querySelector('.charge-progress-circle');
        requestAnimationFrame(() => {
          if (circle) {
            circle.style.transition = 'stroke-dashoffset 600ms cubic-bezier(0.1, 0.7, 0.1, 1)';
            circle.style.strokeDashoffset = '0';
          }
        });

        holdChargeTimer = setTimeout(() => {
          if (!isDragging || hasMoved) return;
          isHoldCompleted = true;
          removeHoldIndicator();

          card.classList.add('is-hold-activated');
          setTimeout(() => card.classList.remove('is-hold-activated'), 400);

          if (this.audioHaptics) {
            this.audioHaptics.playTap();
          }

          // Reset transform
          card.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease';
          card.style.transform = '';
          card.style.opacity = '';

          if (underlyingCard) {
            underlyingCard.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
            underlyingCard.style.transform = '';
          }

          if (item) {
            globalCommentTooltip.open(item, { x: startX, y: startY });
          }
        }, 600);
      }, 500);

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

      if (dist > 7) {
        hasMoved = true;
        removeHoldIndicator();
        card.classList.add('is-dragging');
      }

      if (hasMoved) {
        if (e.cancelable) e.preventDefault();
        const rot = dx * 0.045;
        card.style.transform = `translate3d(${dx}px, ${dy}px, 0px) rotate(${rot}deg)`;
        const opacityRatio = Math.max(0.4, 1 - dist / 380);
        card.style.opacity = String(opacityRatio);

        // Dynamically lift the underlying card into place as user drags top card
        if (underlyingCard) {
          const q = Math.min(dist / 140, 1);
          const restX = side === 'left' ? 5 : -5;
          const restY = 7;
          const restRot = side === 'left' ? -1.5 : 1.5;
          const restScale = 0.985;

          const curX = restX * (1 - q);
          const curY = restY * (1 - q);
          const curRot = restRot * (1 - q);
          const curScale = restScale + (1 - restScale) * q;

          underlyingCard.style.transition = 'none';
          underlyingCard.style.transform = `translate3d(${curX}px, ${curY}px, 0px) rotate(${curRot}deg) scale(${curScale})`;
        }
      }
    };

    const cleanUp = () => {
      removeHoldIndicator();
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
      card.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease';
      card.style.transform = '';
      card.style.opacity = '';

      if (underlyingCard) {
        underlyingCard.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
        underlyingCard.style.transform = '';
      }
    };

    const onPointerEnd = (e) => {
      if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
      isDragging = false;
      card.classList.remove('is-dragging');
      cleanUp();

      if (isHoldCompleted) {
        return;
      }

      const dist = Math.hypot(dx, dy);
      const duration = performance.now() - startTime;
      const velocity = dist / Math.max(duration, 1);

      // Swipe away in ANY direction or fast flick -> discard!
      if (hasMoved && (dist > 45 || velocity > 0.3)) {
        this.discardCard(side, { dx, dy });
      } else if (!hasMoved || dist < 10) {
        // Direct click / tap on card -> discard this card!
        this.discardCard(side);
      } else {
        // Spring back if drag was cancelled/too small
        card.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease';
        card.style.transform = '';
        card.style.opacity = '';

        if (underlyingCard) {
          underlyingCard.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
          underlyingCard.style.transform = '';
        }
      }
    };

    card.onpointerdown = onPointerDown;
  }

  /**
   * User discards a card (side = 'left' | 'right').
   * The other card becomes/remains the defending champion.
   */
  async discardCard(side, dragVector = null) {
    if (this.isAnimating || !this.leftItem || !this.rightItem) return;
    this.isAnimating = true;
    document.querySelectorAll('.is-idle-teasing').forEach(el => el.classList.remove('is-idle-teasing'));

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

    const currentStreak = winnerSide === 'left' ? this.leftStreak : this.rightStreak;

    // Previous champion streak before this outcome
    const prevHistory = this.history[this.history.length - 1];
    const prevChampStreak = prevHistory ? (loserSide === 'left' ? prevHistory.leftStreak : prevHistory.rightStreak) : 0;

    // Audio Haptic with escalation
    if (this.audioHaptics) {
      if (currentStreak >= 5 && typeof this.audioHaptics.playSuperlike === 'function') {
        this.audioHaptics.playSuperlike();
      } else {
        this.audioHaptics.playSwipe('pass');
      }
    }

    // Telemetry
    if (this.analytics) {
      await this.analytics.recordVote(winnerItem, 'like');
      await this.analytics.recordVote(loserItem, 'pass');
    }

    // Calculate Elo changes and Tournament Points
    const matchContext = this.evaluateMatchContext(
      currentStreak > 1 ? winnerItem : (prevChampStreak > 0 ? loserItem : null),
      currentStreak > 1 ? loserItem : winnerItem,
      Math.max(currentStreak, prevChampStreak)
    );
    const eloOutcome = this.updateEloAndPoints(winnerItem, loserItem, Math.max(currentStreak, prevChampStreak), matchContext);

    this.onVoteCallback({ winnerItem, loserItem, winnerSide, loserSide, eloOutcome });

    // Animate cards
    const loserSlot = side === 'left' ? this.container.querySelector('#slotLeft') : this.container.querySelector('#slotRight');
    const winnerSlot = side === 'left' ? this.container.querySelector('#slotRight') : this.container.querySelector('#slotLeft');
    const loserCard = loserSlot ? loserSlot.querySelector('.duel-card') : null;
    const winnerCard = winnerSlot ? winnerSlot.querySelector('.duel-card') : null;
    const loserUnderlying = loserSlot ? loserSlot.querySelector('.duel-underlying-card') : null;

    if (winnerCard) {
      winnerCard.classList.remove('anim-winner-pulse', 'anim-card-enter');
      void winnerCard.offsetWidth;
      winnerCard.classList.add('anim-winner-pulse');
      winnerCard.addEventListener('animationend', () => {
        winnerCard.classList.remove('anim-winner-pulse');
      }, { once: true });
    }

    if (loserUnderlying) {
      // Smoothly bring underlying challenger card into primary position
      loserUnderlying.style.transition = 'transform 0.38s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease';
      loserUnderlying.style.transform = 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
    }

    if (loserCard) {
      loserCard.classList.remove('anim-card-enter', 'anim-winner-pulse', 'is-dragging');
      loserCard.classList.add('is-discarding');
      loserCard.style.pointerEvents = 'none';

      // Force layout flush before applying inline transition and transform
      void loserCard.offsetWidth;

      if (dragVector && Math.hypot(dragVector.dx, dragVector.dy) > 10) {
        // Drag gesture fling along user's flick vector
        const dist = Math.hypot(dragVector.dx, dragVector.dy);
        const factor = Math.max(3.5, 900 / (dist || 1));
        const endX = dragVector.dx * factor;
        const endY = dragVector.dy * factor;
        const endRot = Math.max(-35, Math.min(35, dragVector.dx * 0.08));

        loserCard.style.transition = 'transform 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.34s ease, box-shadow 0.3s ease';
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

        loserCard.style.transition = 'transform 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.34s ease 0.04s, box-shadow 0.3s ease';
        loserCard.style.transform = `translate3d(${endX}px, ${endY}px, 0px) rotate(${endRot}deg) scale(0.92)`;
        loserCard.style.opacity = '0';
      }
    }

    // Dynamic toast notification with Elo and Upset feedback
    if (eloOutcome.isUpset && prevChampStreak >= 3) {
      this.showToast(`⚡ RUŠENJE ŠAMPIONA! ${winnerItem.title} (+${eloOutcome.upsetBounty} Bounty)`);
    } else if (currentStreak >= 6) {
      this.showToast(`👑 ${currentStreak}x ${winnerItem.title} · 🔥 APEX FINALE! (+${eloOutcome.eloGain} Elo)`);
    } else if (currentStreak >= 4) {
      this.showToast(`👑 ${currentStreak}x ${winnerItem.title} · ⚔️ TEŠKA KATEGORIJA (+${eloOutcome.eloGain} Elo)`);
    } else if (currentStreak > 1) {
      this.showToast(`👑 ${currentStreak}x ${winnerItem.title} (+${eloOutcome.eloGain} Elo)`);
    } else {
      this.showToast(`✓ ${winnerItem.title} (+${eloOutcome.eloGain} Elo)`);
    }

    // Adaptively reorder remaining candidate queue for the defending champion & streak
    this.queue = this.reorderQueueForMatchup(winnerItem, currentStreak, this.queue);

    setTimeout(() => {
      if (this.queue.length > 0) {
        const nextChallenger = this.queue.shift();
        this.matchupIndex++;

        if (loserSide === 'left') {
          this.leftItem = nextChallenger;
        } else {
          this.rightItem = nextChallenger;
        }

        // Re-prep upcoming challenger in the remaining queue for next underlying card preview
        if (this.queue.length > 0) {
          this.queue = this.reorderQueueForMatchup(winnerItem, currentStreak, this.queue);
        }

        this.renderArena();
        this.isAnimating = false;
      } else {
        this.handleDeckComplete(winnerItem, currentStreak);
      }
    }, 380);
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

      // Re-sort the queue for open exploration
      this.queue = this.reorderQueueForMatchup(null, 0, this.queue);

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

    // 1. Calculate Full Tournament Standings (Top 3 Podium)
    const allItems = [...this.catalog];
    const scoredList = allItems.map(item => {
      const stats = this.matchStatsMap.get(item.id) || { wins: 0, losses: 0, peakStreak: 0, points: 0 };
      const elo = this.getElo(item);
      return { item, stats, elo };
    });

    // 1st place: ultimateWinner
    const champElo = this.getElo(ultimateWinner);
    const champStats = this.matchStatsMap.get(ultimateWinner.id) || { wins: finalStreak, losses: 0, peakStreak: finalStreak, points: 100 };

    // Filter out champion for runner-up selection
    const runners = scoredList.filter(s => s.item.id !== ultimateWinner.id);

    // Sort runners by Redemption pool priority, then Elo, then points
    runners.sort((a, b) => {
      const aRedeem = this.redemptionPool.find(r => r.item.id === a.item.id);
      const bRedeem = this.redemptionPool.find(r => r.item.id === b.item.id);
      const aScore = (aRedeem ? aRedeem.peakStreak * 120 : 0) + a.elo + (a.stats.points * 2);
      const bScore = (bRedeem ? bRedeem.peakStreak * 120 : 0) + b.elo + (b.stats.points * 2);
      return bScore - aScore;
    });

    const silver = runners[0] ? runners[0] : null;
    const bronze = runners[1] ? runners[1] : null;

    const champSrc = this.resolveImageUrl(ultimateWinner);
    const silverSrc = silver ? this.resolveImageUrl(silver.item) : '';
    const bronzeSrc = bronze ? this.resolveImageUrl(bronze.item) : '';

    const longestStreak = this.longestStreakRecord.streak >= 2 ? this.longestStreakRecord : { item: ultimateWinner, streak: finalStreak };
    const biggestUpset = this.biggestUpsetRecord.winner ? this.biggestUpsetRecord : null;

    this.container.innerHTML = `
      <div class="duel-completion-card duel-podium-view">
        
        <div class="tournament-podium-header">
          <span class="duel-tag-mono duel-gold-text">🏆 ZAVRŠNICA DVOBOJA</span>
          <h2 class="duel-title-condensed" style="font-size:2.2rem; margin-top:0.3rem;">POBJEDNIČKO POSTOLJE</h2>
          <p class="duel-podium-sub">Konačni poredak majica prema osvojenim dvobojima i turnirskom Elo rejtingu</p>
        </div>

        <!-- 3-Step Brutalist Podium Grid -->
        <div class="duel-podium-grid">
          
          <!-- 2nd Place (Silver) -->
          ${silver ? `
          <div class="podium-col rank-2">
            <div class="podium-card-wrap">
              <span class="podium-rank-badge rank-silver">🥈 2. MJESTO</span>
              <div class="podium-img-box" data-zoom-id="${silver.item.id}" title="Povećaj sliku">
                <img src="${silverSrc}" alt="${silver.item.title}">
              </div>
              <h3 class="podium-item-title">${silver.item.title}</h3>
              <div class="podium-stats-row">
                <span class="podium-stat-chip">⚡ ${silver.elo} ELO</span>
                <span class="podium-stat-chip">🔥 ${silver.stats.peakStreak || 1}x NIZ</span>
              </div>
            </div>
            <div class="podium-pedestal pedestal-2">
              <span class="pedestal-num">2</span>
            </div>
          </div>
          ` : ''}

          <!-- 1st Place (Gold Champion) -->
          <div class="podium-col rank-1">
            <div class="podium-card-wrap champion-podium-wrap">
              <span class="podium-rank-badge rank-gold">👑 ŠAMPION ARENE</span>
              <div class="podium-img-box champion-img-box" data-zoom-id="${ultimateWinner.id}" title="Povećaj sliku (2K)">
                <img src="${champSrc}" alt="${ultimateWinner.title}">
                <div class="scanline-overlay"></div>
              </div>
              <h2 class="podium-item-title champion-title">${ultimateWinner.title}</h2>
              <div class="podium-stats-row">
                <span class="podium-stat-chip gold-chip">⚡ ${champElo} ELO</span>
                <span class="podium-stat-chip gold-chip">🔥 ${finalStreak}x NIZ</span>
                <span class="podium-stat-chip gold-chip">🏆 ${champStats.points} PTS</span>
              </div>
            </div>
            <div class="podium-pedestal pedestal-1">
              <span class="pedestal-num">1</span>
            </div>
          </div>

          <!-- 3rd Place (Bronze) -->
          ${bronze ? `
          <div class="podium-col rank-3">
            <div class="podium-card-wrap">
              <span class="podium-rank-badge rank-bronze">🥉 3. MJESTO</span>
              <div class="podium-img-box" data-zoom-id="${bronze.item.id}" title="Povećaj sliku">
                <img src="${bronzeSrc}" alt="${bronze.item.title}">
              </div>
              <h3 class="podium-item-title">${bronze.item.title}</h3>
              <div class="podium-stats-row">
                <span class="podium-stat-chip">⚡ ${bronze.elo} ELO</span>
                <span class="podium-stat-chip">🔥 ${bronze.stats.peakStreak || 1}x NIZ</span>
              </div>
            </div>
            <div class="podium-pedestal pedestal-3">
              <span class="pedestal-num">3</span>
            </div>
          </div>
          ` : ''}

        </div>

        <!-- Special Awards Row -->
        <div class="duel-awards-grid">
          <div class="duel-award-card">
            <span class="award-icon">🔥</span>
            <div class="award-info">
              <span class="award-label">NAJDUŽI NIZ POBJEDA</span>
              <strong class="award-value">${longestStreak.item ? longestStreak.item.title : ultimateWinner.title} (${longestStreak.streak}x)</strong>
            </div>
          </div>
          ${biggestUpset ? `
          <div class="duel-award-card">
            <span class="award-icon">⚡</span>
            <div class="award-info">
              <span class="award-label">NAJVEĆE IZNENAĐENJE (UPSET)</span>
              <strong class="award-value">${biggestUpset.winner.title} (+${biggestUpset.bounty} Bounty)</strong>
            </div>
          </div>
          ` : `
          <div class="duel-award-card">
            <span class="award-icon">🎯</span>
            <div class="award-info">
              <span class="award-label">ODIGRANIH DVOBOJA</span>
              <strong class="award-value">${this.matchupIndex - 1} mečeva završeno</strong>
            </div>
          </div>
          `}
        </div>

        <!-- Action Controls -->
        <div class="duel-actions-mini" style="margin-top:1.5rem; gap:14px;">
          <button id="btnRestartCompletedDuel" class="duel-pill-btn active" style="padding:12px 26px; font-size:0.95rem; font-weight:800;">
            ↺ PONOVI TURNIR
          </button>
          
          <button id="btnDuelViewLeaderboard" class="duel-pill-btn" style="padding:12px 26px; font-size:0.95rem; font-weight:800;">
            🏆 SVEUKUPNA RANG LISTA
          </button>
        </div>

      </div>
    `;

    // Bind zoom on podium images
    this.container.querySelectorAll('[data-zoom-id]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-zoom-id');
        const item = this.catalog.find(it => it.id === id);
        if (item) this.onImageClickCallback(item);
      });
    });

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
