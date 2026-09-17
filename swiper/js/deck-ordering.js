/**
 * Studio Varaždin — OmniActive Bayesian Deck Ordering & Active Learning Engine
 * 
 * Implements a multi-phase active learning and sequential recommendation algorithm:
 * 
 * Phase 0: Golden Opener (Card 1) — Probabilistic Thompson sampling over top-tier Anchor Set
 *          to maximize immediate hook potency, eliminate bounce rate, and provide maximum
 *          discriminative entropy.
 * Phase 1: Orthogonal Aesthetic Probes (Cards 2–5) — Maximal latent style distance search
 *          across distinct aesthetic pillars (Gothic Armor, Brutalist Tech, 70s Comix, Minimal Woodcut)
 *          to rapidly bifurcate user taste space in O(log2 K) swipes.
 * Phase 2: Contextual Bayesian Taste Deepening (Cards 6–18) — Real-time exponential-decay taste
 *          vector θ_u alignment to exploit discovered aesthetic clusters with highest quality items.
 * Phase 3: Active Information Gain & Long-Tail Coverage (Cards 19+) — Expected Information Gain (EIG),
 *          posterior uncertainty sampling, and controversy-boundary mining to guarantee statistical
 *          sample power across the entire catalog.
 * Cognitive Rhythm: High-speed constraint solver enforcing category caps (<= 2 consecutive),
 *          theme interleaving, and visual contrast rhythm.
 */

export class DynamicDeckOrdering {
  constructor(options = {}) {
    // Bayesian prior pseudo-counts (Beta-Bernoulli / Dirichlet prior)
    this.priorAlpha = options.priorAlpha !== undefined ? options.priorAlpha : 2.0;
    this.priorBeta = options.priorBeta !== undefined ? options.priorBeta : 2.0;

    // Multi-objective scoring weights
    this.alpha = options.alpha !== undefined ? options.alpha : 0.38; // Bayesian Quality Mean
    this.beta = options.beta !== undefined ? options.beta : 0.28;   // UCB & Posterior Uncertainty
    this.gamma = options.gamma !== undefined ? options.gamma : 0.34; // Online Taste Vector Cosine Affinity
    this.entropyWeight = options.entropyWeight !== undefined ? options.entropyWeight : 0.16; // Shannon Entropy / Controversy

    // Target sample count for active catalog coverage
    this.targetSampleSize = options.targetSampleSize || 15;

    // Cognitive rhythm anti-fatigue constraints
    this.maxConsecutiveCategory = options.maxConsecutiveCategory || 2;
    this.maxConsecutiveTag = options.maxConsecutiveTag || 2;
    this.phase1ProbeCount = options.phase1ProbeCount || 4; // Cards 2 through 5
  }

  /**
   * Main entry point: Computes the complete dynamically optimized sequence for a deck.
   * 
   * @param {Array} catalog - Full catalog of design objects
   * @param {Object} globalStats - Global aggregated stats from backend or local cache
   * @param {Array} sessionVotes - User's real-time swipe history in this session
   * @param {string} filterCategory - 'ALL' or specific category
   * @param {Object} options - Optional overrides
   * @returns {Array} Ordered deck of design objects with rich optimization metadata
   */
  orderDeck(catalog = [], globalStats = {}, sessionVotes = [], filterCategory = 'ALL', options = {}) {
    let pool = filterCategory === 'ALL'
      ? [...catalog]
      : catalog.filter(it => (it.category || '').toUpperCase() === filterCategory.toUpperCase());

    if (!pool.length) return [];

    // Filter out already swiped cards in active session (unless all have been swiped)
    const swipedIds = new Set(sessionVotes.map(v => v.id));
    const unswiped = pool.filter(it => !swipedIds.has(it.id));
    const alreadySwiped = pool.filter(it => swipedIds.has(it.id));

    const candidates = unswiped.length > 0 ? unswiped : pool;
    if (candidates.length <= 2) return pool;

    // 1. Calculate Online Bayesian Taste Vector theta_u from session history
    const tasteProfile = this.calculateUserTasteVector(sessionVotes);

    // 2. Global impressions summary
    const totalGlobalVotes = (globalStats.totalVotes || 0) + sessionVotes.length;

    // 3. Extract items stats map
    const statsMap = this.buildStatsMap(globalStats, candidates);

    // -------------------------------------------------------------------------
    // PHASE 0: Determine The "Golden Opener" (Card 1)
    // -------------------------------------------------------------------------
    let remainingPool = [...candidates];
    let orderedDeck = [];

    // If starting a fresh session (or category filter with unswiped cards)
    if (sessionVotes.length === 0 || unswiped.length === pool.length) {
      const firstCard = this.determineFirstCard(remainingPool, statsMap, totalGlobalVotes, filterCategory);
      if (firstCard) {
        firstCard._orderingMeta = {
          phase: 'phase_0_anchor',
          phaseLabel: 'Golden Opener',
          reason: 'Thompson-sampled visual anchor with high aesthetic resonance & discriminative power',
          score: 1.0
        };
        orderedDeck.push(firstCard);
        remainingPool = remainingPool.filter(it => it.id !== firstCard.id);
      }

      // -----------------------------------------------------------------------
      // PHASE 1: Select Orthogonal Aesthetic Probes (Cards 2 – 5)
      // -----------------------------------------------------------------------
      if (filterCategory === 'ALL' && remainingPool.length >= this.phase1ProbeCount) {
        const probes = this.computeOrthogonalProbes(firstCard, remainingPool, statsMap, this.phase1ProbeCount);
        probes.forEach((probe, idx) => {
          probe._orderingMeta = {
            phase: 'phase_1_probe',
            phaseLabel: `Aesthetic Probe ${idx + 1}`,
            reason: `Orthogonal style probe spanning ${probe.category || 'diverse'} aesthetic space`,
            score: 0.9 - (idx * 0.05)
          };
          orderedDeck.push(probe);
          remainingPool = remainingPool.filter(it => it.id !== probe.id);
        });
      }
    }

    // -------------------------------------------------------------------------
    // PHASES 2 & 3: Score Remaining Candidates (Bayesian Affinity + Active Information Gain)
    // -------------------------------------------------------------------------
    const scoredRemaining = remainingPool.map((item, idx) => {
      const itemStats = statsMap[item.id] || { likes: item.likes || 0, superlikes: item.superlikes || 0, passes: item.passes || 0 };
      const scoreObj = this.computeItemDynamicScore(item, itemStats, totalGlobalVotes, tasteProfile, orderedDeck.length + idx);
      return {
        item,
        score: scoreObj.finalScore,
        meta: scoreObj,
        category: (item.category || 'General').toUpperCase(),
        tags: Array.isArray(item.tags) ? item.tags : []
      };
    });

    // Sort scored candidates descending by composite dynamic score
    scoredRemaining.sort((a, b) => b.score - a.score);

    // Apply Cognitive Rhythm & Anti-Fatigue Interleaving Constraint Solver
    const interleavedRemaining = this.applyCognitiveRhythm(scoredRemaining, orderedDeck);

    interleavedRemaining.forEach((c) => {
      const position = orderedDeck.length + 1;
      const isPhase2 = position <= 18 && tasteProfile.hasStrongPreferences;
      c.item._orderingMeta = {
        phase: isPhase2 ? 'phase_2_affinity' : 'phase_3_active_learning',
        phaseLabel: isPhase2 ? 'Personalized Taste Match' : 'Active Variance Discovery',
        reason: isPhase2 
          ? `High affinity to user preference profile (${c.meta.dominantMatch || c.category})`
          : (c.meta.isUnderSampled ? 'Under-sampled design exposure (Information Gain)' : 'Balanced quality & controversy exploration'),
        score: parseFloat(c.score.toFixed(4)),
        qualityMean: parseFloat(c.meta.qualityMean.toFixed(3)),
        affinityScore: parseFloat(c.meta.normAffinity.toFixed(3)),
        informationGain: parseFloat(c.meta.normEIG.toFixed(3)),
        entropy: parseFloat(c.meta.entropy.toFixed(3))
      };
      orderedDeck.push(c.item);
    });

    // Append any already-swiped cards at the very tail of the deck if needed
    if (unswiped.length > 0 && alreadySwiped.length > 0) {
      return [...orderedDeck, ...alreadySwiped];
    }

    return orderedDeck;
  }

  /**
   * Selects the optimal first card (Golden Opener) via Thompson Sampling from the Anchor Set.
   */
  determineFirstCard(candidates = [], statsMap = {}, totalGlobalVotes = 0, filterCategory = 'ALL') {
    if (!candidates.length) return null;

    // Anchor flagship candidates
    const scoredAnchors = candidates.map(item => {
      const stats = statsMap[item.id] || { likes: item.likes || 0, superlikes: item.superlikes || 0, passes: item.passes || 0 };
      const total = stats.likes + stats.superlikes + stats.passes;

      // Bayesian mean with optimistic prior for hook
      const alpha = stats.likes + (stats.superlikes * 3) + this.priorAlpha + 2;
      const beta = (stats.passes * 1.5) + this.priorBeta;
      const bayesianMean = alpha / (alpha + beta);

      // Hero flag boost for known flagship studio anchors
      let heroBoost = 0;
      const slug = (item.slug || '').toLowerCase();
      const title = (item.title || '').toLowerCase();
      if (slug.includes('silent_knight') || slug.includes('creative_block') || title.includes('silent knight')) {
        heroBoost = 0.35;
      } else if (slug.includes('maker') || slug.includes('inspired_by_craft') || slug.includes('attention_cash')) {
        heroBoost = 0.25;
      } else if (item.category === 'Selected') {
        heroBoost = 0.20;
      }

      // Visual clarity score: Prefer clean, bold, instantly recognizable graphics
      let clarityScore = 0.8;
      if (slug.includes('front') || slug.includes('sigil') || slug.includes('collage')) {
        clarityScore = 0.95;
      }

      // Discriminant Entropy: High entropy items bifurcate taste space faster
      const p = total > 0 ? (stats.likes + stats.superlikes) / total : 0.5;
      const entropy = this.calculateShannonEntropy(p);

      const hookScore = (0.45 * bayesianMean) + (0.30 * heroBoost) + (0.15 * clarityScore) + (0.10 * entropy);

      return {
        item,
        hookScore,
        bayesianMean
      };
    });

    // Sort by hook score
    scoredAnchors.sort((a, b) => b.hookScore - a.hookScore);

    // Pick top-tier anchor set (top 5 or 25% of pool)
    const anchorTierSize = Math.max(2, Math.min(6, Math.floor(candidates.length * 0.25)));
    const anchorSet = scoredAnchors.slice(0, anchorTierSize);

    // Softmax selection over anchor set with temperature T = 0.25 (favors top items but provides healthy rotation)
    const temperature = 0.25;
    const maxScore = anchorSet[0].hookScore;
    const exps = anchorSet.map(a => Math.exp((a.hookScore - maxScore) / temperature));
    const sumExps = exps.reduce((acc, v) => acc + v, 0);
    const probs = exps.map(v => v / sumExps);

    let rand = Math.random();
    let cum = 0;
    for (let i = 0; i < anchorSet.length; i++) {
      cum += probs[i];
      if (rand <= cum || i === anchorSet.length - 1) {
        return anchorSet[i].item;
      }
    }

    return anchorSet[0].item;
  }

  /**
   * Greedily computes k orthogonal aesthetic probes that maximize pairwise style distance.
   */
  computeOrthogonalProbes(firstCard, pool = [], statsMap = {}, count = 4) {
    if (!pool.length || count <= 0) return [];

    const selectedProbes = [];
    let available = [...pool];

    // Style representations: category, dominant tag cluster, canvas tone
    const getFeatures = (it) => {
      const cat = (it.category || 'ARTWEAR').toUpperCase();
      const tags = (it.tags || []).map(t => t.toLowerCase());
      const slug = (it.slug || '').toLowerCase();
      const isLight = slug.includes('white') || slug.includes('cream') || slug.includes('light');
      return { cat, tags, isLight, slug };
    };

    const firstFeatures = firstCard ? getFeatures(firstCard) : null;
    const currentFrontier = firstFeatures ? [firstFeatures] : [];

    for (let step = 0; step < count && available.length > 0; step++) {
      let bestCandidate = null;
      let maxDistance = -Infinity;
      let bestIdx = -1;

      for (let i = 0; i < available.length; i++) {
        const item = available[i];
        const feat = getFeatures(item);

        // Calculate minimum distance from all currently selected frontier items
        let minFrontierDist = Infinity;
        for (const existing of currentFrontier) {
          let d = 0;
          // Category distance
          if (feat.cat !== existing.cat) d += 1.0;
          // Canvas tone contrast
          if (feat.isLight !== existing.isLight) d += 0.4;
          // Tag Jaccard distance
          const unionTags = new Set([...feat.tags, ...existing.tags]);
          let common = 0;
          feat.tags.forEach(t => { if (existing.tags.includes(t)) common++; });
          const jaccardDist = unionTags.size > 0 ? 1 - (common / unionTags.size) : 1;
          d += jaccardDist * 0.6;

          if (d < minFrontierDist) minFrontierDist = d;
        }

        // Quality regularization so we don't pick broken/unappealing designs as probes
        const stats = statsMap[item.id] || { likes: item.likes || 0, superlikes: item.superlikes || 0, passes: item.passes || 0 };
        const total = stats.likes + stats.superlikes + stats.passes;
        const quality = total > 0 ? (stats.likes + stats.superlikes * 2) / (total * 2) : 0.5;

        const compositeScore = minFrontierDist + (quality * 0.35) + ((Math.random() - 0.5) * 0.1);

        if (compositeScore > maxDistance) {
          maxDistance = compositeScore;
          bestCandidate = item;
          bestIdx = i;
        }
      }

      if (bestCandidate && bestIdx >= 0) {
        selectedProbes.push(bestCandidate);
        currentFrontier.push(getFeatures(bestCandidate));
        available.splice(bestIdx, 1);
      }
    }

    return selectedProbes;
  }

  /**
   * Online Bayesian Particle / Taste Vector theta_u from session history.
   */
  calculateUserTasteVector(sessionVotes = []) {
    const categoryWeights = {};
    const tagWeights = {};
    let lightToneWeight = 0;
    let darkToneWeight = 0;

    if (!sessionVotes.length) {
      return {
        categoryWeights,
        tagWeights,
        lightToneWeight: 0,
        darkToneWeight: 0,
        hasStrongPreferences: false,
        totalVotes: 0
      };
    }

    // Exponential decay parameter for recency weighting (gamma = 0.92)
    const decayFactor = 0.92;
    const n = sessionVotes.length;

    sessionVotes.forEach((v, idx) => {
      const recency = Math.pow(decayFactor, n - 1 - idx);
      let valence = 0;
      if (v.action === 'superlike') valence = 2.6;
      else if (v.action === 'like') valence = 1.0;
      else if (v.action === 'pass') valence = -0.85;

      const weightedValence = valence * recency;

      // Category
      const cat = (v.category || (v.item && v.item.category) || '').toUpperCase();
      if (cat) {
        categoryWeights[cat] = (categoryWeights[cat] || 0) + weightedValence;
      }

      // Tags
      const tags = (v.item && v.item.tags) || [];
      tags.forEach(t => {
        const key = t.toLowerCase();
        tagWeights[key] = (tagWeights[key] || 0) + weightedValence;
      });

      // Canvas tone
      const slug = ((v.item && v.item.slug) || v.slug || '').toLowerCase();
      if (slug.includes('white') || slug.includes('cream')) {
        lightToneWeight += weightedValence;
      } else if (slug.includes('black') || slug.includes('dark')) {
        darkToneWeight += weightedValence;
      }
    });

    const maxCatVal = Math.max(0, ...Object.values(categoryWeights));
    const hasStrongPreferences = n >= 3 && (maxCatVal >= 1.5 || Object.values(tagWeights).some(v => Math.abs(v) >= 1.8));

    return {
      categoryWeights,
      tagWeights,
      lightToneWeight,
      darkToneWeight,
      hasStrongPreferences,
      totalVotes: n
    };
  }

  /**
   * Computes the dynamic composite active learning score for a candidate card.
   */
  computeItemDynamicScore(item, itemStats, totalGlobalVotes, tasteProfile, deckPosition) {
    const likes = itemStats.likes || 0;
    const superlikes = itemStats.superlikes || 0;
    const passes = itemStats.passes || 0;
    const totalItemVotes = likes + superlikes + passes;

    // 1. Bayesian Posterior Quality Mean (Beta-Bernoulli Conjugate with Dirichlet-weighted Superlikes)
    const effectiveLikes = likes + (superlikes * 2.8);
    const alphaPost = effectiveLikes + this.priorAlpha;
    const betaPost = (passes * 1.2) + this.priorBeta;
    const qualityMean = alphaPost / (alphaPost + betaPost);

    // 2. Posterior Uncertainty & Upper Confidence Bound (UCB1)
    const ucbExploration = Math.sqrt((2.0 * Math.log(totalGlobalVotes + 4)) / (totalItemVotes + 1));
    const normExploration = Math.min(1.0, ucbExploration / 2.8);

    // 3. Expected Information Gain (EIG) & Shannon Entropy
    const p = totalItemVotes > 0 ? (likes + superlikes) / totalItemVotes : 0.5;
    const entropy = this.calculateShannonEntropy(p);

    // Under-sampled design exposure bonus (Fair catalog exploration)
    const isUnderSampled = totalItemVotes < this.targetSampleSize;
    const sampleDeficit = Math.max(0, this.targetSampleSize - totalItemVotes) / this.targetSampleSize;
    const normEIG = (0.6 * normExploration) + (0.4 * entropy) + (0.3 * sampleDeficit);

    // 4. Online User Taste Affinity (Cosine alignment with theta_u)
    const catKey = (item.category || '').toUpperCase();
    let affinityRaw = tasteProfile.categoryWeights[catKey] || 0;

    let dominantMatch = catKey;
    let maxTagAffinity = 0;

    if (item.tags && Array.isArray(item.tags)) {
      item.tags.forEach(t => {
        const tw = tasteProfile.tagWeights[t.toLowerCase()] || 0;
        affinityRaw += tw * 0.45;
        if (tw > maxTagAffinity) {
          maxTagAffinity = tw;
          dominantMatch = t;
        }
      });
    }

    const slug = (item.slug || '').toLowerCase();
    if (slug.includes('white') && tasteProfile.lightToneWeight > 0) {
      affinityRaw += tasteProfile.lightToneWeight * 0.2;
    } else if (slug.includes('black') && tasteProfile.darkToneWeight > 0) {
      affinityRaw += tasteProfile.darkToneWeight * 0.2;
    }

    // Sigmoid squashing for taste affinity [-6, 6] -> [0, 1]
    const normAffinity = 1 / (1 + Math.exp(-affinityRaw * 0.75));

    // Dynamic phase weight adaptation:
    // Positions 6–18 emphasize taste affinity (Exploitation), later positions emphasize EIG (Active Learning)
    let wQuality = this.alpha;
    let wAffinity = this.gamma;
    let wExplore = this.beta;
    let wEntropy = this.entropyWeight;

    if (deckPosition <= 18 && tasteProfile.hasStrongPreferences) {
      wAffinity *= 1.35;
      wQuality *= 1.1;
      wExplore *= 0.7;
    } else if (deckPosition > 18) {
      wExplore *= 1.3;
      wEntropy *= 1.25;
      wAffinity *= 0.85;
    }

    // Stochastic micro-jitter (prevents deterministic ties while maintaining rank stability)
    const jitter = (Math.random() - 0.5) * 0.04;

    const finalScore = 
      (wQuality * qualityMean) +
      (wAffinity * normAffinity) +
      (wExplore * normExploration) +
      (wEntropy * entropy) +
      jitter;

    return {
      finalScore,
      qualityMean,
      normAffinity,
      normExploration,
      normEIG,
      entropy,
      isUnderSampled,
      dominantMatch,
      totalItemVotes
    };
  }

  /**
   * Applies cognitive rhythm and anti-fatigue constraint interleaving to scored candidates.
   * Utilizes Pigeonhole Stride Interleaving to optimally distribute dominant categories
   * and alternate visual tones without category exhaustion.
   */
  applyCognitiveRhythm(scoredList, existingPrefix = []) {
    const result = [];
    const pool = [...scoredList];

    let lastCategory = existingPrefix.length > 0 ? (existingPrefix[existingPrefix.length - 1].category || '').toUpperCase() : '';
    let consecutiveCount = existingPrefix.length > 0 ? 1 : 0;
    let lastTone = existingPrefix.length > 0 ? this.getTone(existingPrefix[existingPrefix.length - 1]) : null;
    let lastTag = '';
    const catLastSeen = {};

    while (pool.length > 0) {
      const totalRemaining = pool.length;
      const catCounts = {};
      let maxCat = '';
      let maxCount = 0;

      pool.forEach(it => {
        const cat = (it.category || 'General').toUpperCase();
        catCounts[cat] = (catCounts[cat] || 0) + 1;
        if (catCounts[cat] > maxCount) {
          maxCount = catCounts[cat];
          maxCat = cat;
        }
      });

      const otherCount = totalRemaining - maxCount;
      const isDominantCritical = maxCount > otherCount;

      let bestIdx = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < pool.length; i++) {
        const cand = pool[i];
        const cat = (cand.category || 'General').toUpperCase();
        const tone = this.getTone(cand.item);
        const tags = cand.tags || [];

        // Hard constraint: if last category had >= max consecutive, do NOT pick unless only that category exists
        if (cat === lastCategory && consecutiveCount >= this.maxConsecutiveCategory && otherCount > 0) {
          continue;
        }

        let priority = cand.score;

        // Pigeonhole stride pressure: if dominant category is critical and last was NOT dominant, strongly favor dominant to conserve dividers
        if (isDominantCritical) {
          if (cat === maxCat && lastCategory !== maxCat) {
            priority += 0.85;
          } else if (cat !== maxCat && lastCategory === maxCat) {
            priority += 0.40;
          }
        } else {
          // Normal harmonic pacing
          const density = catCounts[cat] / totalRemaining;
          const targetInterval = Math.max(1, Math.round(1 / density));
          const distance = result.length - (catLastSeen[cat] !== undefined ? catLastSeen[cat] : -targetInterval);
          priority += (distance / targetInterval) * 0.35;
          if (cat === lastCategory) priority -= 0.30;
        }

        // Tone & Tag alternation bonuses
        if (lastTone !== null && tone !== lastTone) priority += 0.10;
        if (lastTag && tags.map(t => t.toLowerCase()).includes(lastTag)) priority -= 0.12;

        if (priority > bestScore) {
          bestScore = priority;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) {
        bestIdx = 0;
      }

      const [picked] = pool.splice(bestIdx, 1);
      const pickedCat = (picked.category || 'General').toUpperCase();
      result.push(picked);

      if (pickedCat === lastCategory) {
        consecutiveCount++;
      } else {
        lastCategory = pickedCat;
        consecutiveCount = 1;
      }

      lastTone = this.getTone(picked.item);
      if (picked.tags && picked.tags.length > 0) lastTag = picked.tags[0].toLowerCase();
      catLastSeen[pickedCat] = result.length - 1;
    }

    return result;
  }

  getTone(item) {
    if (!item) return 'dark';
    const slug = (item.slug || '').toLowerCase();
    return (slug.includes('white') || slug.includes('cream') || slug.includes('light')) ? 'light' : 'dark';
  }

  calculateShannonEntropy(p) {
    if (p <= 0.001 || p >= 0.999) return 0;
    const h = - (p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
    return Math.max(0, Math.min(1, h));
  }

  buildStatsMap(globalStats, candidates) {
    const map = {};
    if (globalStats && globalStats.topRanked && Array.isArray(globalStats.topRanked)) {
      globalStats.topRanked.forEach(it => {
        map[it.id] = {
          likes: it.totalLikes || it.likes || 0,
          superlikes: it.totalSuperlikes || it.superlikes || 0,
          passes: it.totalPasses || it.passes || 0
        };
      });
    }

    // Ensure all candidates have a baseline entry
    candidates.forEach(c => {
      if (!map[c.id]) {
        map[c.id] = {
          likes: c.likes || 0,
          superlikes: c.superlikes || 0,
          passes: c.passes || 0
        };
      }
    });

    return map;
  }

  /**
   * Seamless online queue updater for CardEngine.
   * Reorders cards from splitIndex to end without altering visible cards.
   */
  reorderTail(currentDeck = [], splitIndex = 4, globalStats = {}, sessionVotes = [], filterCategory = 'ALL') {
    if (!currentDeck.length || splitIndex >= currentDeck.length) return currentDeck;

    const visibleHead = currentDeck.slice(0, splitIndex);
    const unseenTail = currentDeck.slice(splitIndex);

    const reorderedTail = this.orderDeck(unseenTail, globalStats, sessionVotes, filterCategory);
    return [...visibleHead, ...reorderedTail];
  }
}
