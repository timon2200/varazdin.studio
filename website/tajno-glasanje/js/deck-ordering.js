/**
 * Studio Varaždin — Dynamic Adaptive Card Ordering Algorithm
 * 
 * Implements:
 * 1. Upper Confidence Bound (UCB1 / Bandit Exploration) for fair exposure of new designs
 * 2. Quality Exploitation (High-rated / Community favorites spotlighting)
 * 3. Real-time Session Affinity (Adapts remaining cards to what user is liking in the moment)
 * 4. Category Diversity Anti-Fatigue (Interleaves styles to prevent repetitive streaks)
 */

export class DynamicDeckOrdering {
  constructor(options = {}) {
    // Tuning weights
    this.alpha = options.alpha !== undefined ? options.alpha : 0.40; // Community Quality Weight
    this.beta = options.beta !== undefined ? options.beta : 0.35;   // Exploration Uncertainty Weight
    this.gamma = options.gamma !== undefined ? options.gamma : 0.25; // User Session Affinity Weight
    this.maxConsecutiveCategory = 2; // Maximum times same category can appear in a row
  }

  /**
   * Computes dynamic order of cards given catalog, global stats, and current user session.
   * @param {Array} catalog - Array of all catalog design objects
   * @param {Object} globalStats - Aggregated community stats (from AnalyticsEngine / API)
   * @param {Array} sessionVotes - Array of user's votes in this session
   * @param {string} filterCategory - 'ALL' or specific category
   * @returns {Array} Dynamically optimized card deck
   */
  orderDeck(catalog = [], globalStats = {}, sessionVotes = [], filterCategory = 'ALL') {
    let pool = filterCategory === 'ALL'
      ? [...catalog]
      : catalog.filter(it => it.category.toUpperCase() === filterCategory.toUpperCase());

    if (!pool.length) return [];

    // Filter out already swiped cards from the active session if we want to show unviewed cards first
    const swipedIds = new Set(sessionVotes.map(v => v.id));
    const unswiped = pool.filter(it => !swipedIds.has(it.id));
    const alreadySwiped = pool.filter(it => swipedIds.has(it.id));

    // If all cards were swiped, allow reshuffled re-swipe of the whole pool
    const candidates = unswiped.length > 0 ? unswiped : pool;

    // 1. Calculate Session Taste Profile (User Affinity)
    const categoryAffinity = {};
    const tagAffinity = {};

    sessionVotes.forEach(v => {
      const weight = v.action === 'superlike' ? 2.5 : (v.action === 'like' ? 1.0 : -0.8);
      const cat = (v.category || '').toUpperCase();
      categoryAffinity[cat] = (categoryAffinity[cat] || 0) + weight;

      if (v.item && v.item.tags) {
        v.item.tags.forEach(t => {
          tagAffinity[t] = (tagAffinity[t] || 0) + weight;
        });
      }
    });

    // 2. Global Total Impressions
    const totalGlobalVotes = (globalStats.totalVotes || 0) + sessionVotes.length;

    // 3. Compute Composite Dynamic Score for Each Candidate
    const scoredCandidates = candidates.map(item => {
      // A. Quality Score (Normalized Community Score)
      const likes = item.likes || 0;
      const superlikes = item.superlikes || 0;
      const passes = item.passes || 0;
      const totalItemVotes = likes + superlikes + passes;

      let qualityScore = 0.5; // Neutral prior
      if (totalItemVotes > 0) {
        qualityScore = Math.max(0, Math.min(1, (likes + (superlikes * 3)) / (totalItemVotes * 2.5)));
      }

      // Flagship boost for Silent Knight hero
      if (item.slug && item.slug.includes('silent_knight')) {
        qualityScore += 0.4;
      }

      // B. Exploration Score (Upper Confidence Bound: square root of log(total) / count)
      const explorationScore = Math.sqrt((2 * Math.log(totalGlobalVotes + 2)) / (totalItemVotes + 1));
      const normExploration = Math.min(1, explorationScore / 3.0);

      // C. User Session Affinity
      const catKey = (item.category || '').toUpperCase();
      let affinityScore = categoryAffinity[catKey] || 0;
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach(t => {
          affinityScore += (tagAffinity[t] || 0) * 0.5;
        });
      }
      // Sigmoid normalization for affinity: [-5, 5] -> [0, 1]
      const normAffinity = 1 / (1 + Math.exp(-affinityScore * 0.6));

      // D. Stochastic Micro-Jitter (prevents exact deterministic duplicates)
      const jitter = (Math.random() - 0.5) * 0.08;

      // Final Composite Score
      const finalScore = 
        (this.alpha * qualityScore) +
        (this.beta * normExploration) +
        (this.gamma * normAffinity) +
        jitter;

      return {
        item,
        score: finalScore,
        category: catKey,
        isHero: item.slug && item.slug.includes('silent_knight_studio_black')
      };
    });

    // Sort descending by score
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Pin Silent Knight Studio Black to position 0 on fresh deck for flagship brand impact
    if (sessionVotes.length === 0 && filterCategory === 'ALL') {
      const heroIdx = scoredCandidates.findIndex(c => c.isHero);
      if (heroIdx > 0) {
        const [hero] = scoredCandidates.splice(heroIdx, 1);
        scoredCandidates.unshift(hero);
      }
    }

    // 4. Apply Diversity Constraint (Interleaving to prevent visual fatigue)
    const balancedDeck = this.applyCategoryDiversity(scoredCandidates);

    // If we only ordered unswiped, append already swiped items at the very end
    if (unswiped.length > 0 && alreadySwiped.length > 0) {
      return [...balancedDeck, ...alreadySwiped];
    }

    return balancedDeck;
  }

  /**
   * Greedy diversity filter: guarantees no single category dominates streaks.
   */
  applyCategoryDiversity(scoredList) {
    const result = [];
    const pool = [...scoredList];
    let lastCategory = '';
    let consecutiveCount = 0;

    while (pool.length > 0) {
      // Find the highest-scoring candidate that doesn't violate consecutive streak
      let pickedIdx = -1;

      for (let i = 0; i < pool.length; i++) {
        const cand = pool[i];
        if (cand.category !== lastCategory || consecutiveCount < this.maxConsecutiveCategory) {
          pickedIdx = i;
          break;
        }
      }

      // If all remaining candidates are from the same category, pick the top one
      if (pickedIdx === -1) {
        pickedIdx = 0;
      }

      const [picked] = pool.splice(pickedIdx, 1);
      result.push(picked.item);

      if (picked.category === lastCategory) {
        consecutiveCount++;
      } else {
        lastCategory = picked.category;
        consecutiveCount = 1;
      }
    }

    return result;
  }
}
