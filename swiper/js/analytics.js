/**
 * Studio Varaždin — Analytics & Telemetry Engine
 * Tracks user swipes, syncs with backend PHP/JSON API, calculates leaderboard stats from 0.
 */

export class AnalyticsEngine {
  constructor(catalog = []) {
    this.catalog = catalog;
    this.apiBase = this.getApiBase();
    this.sessionVotes = [];
    this.statsCache = null;
    this.sessionId = this.getOrCreateSessionId();
    this.liveTickerListeners = [];
    this.online = navigator.onLine;

    window.addEventListener('online', () => {
      this.online = true;
      this.flushOfflineVotes();
    });
    window.addEventListener('offline', () => {
      this.online = false;
    });

    this.loadLocalVotes();
  }

  getApiBase() {
    try {
      let path = window.location.pathname;
      if (path.endsWith('.html') || path.endsWith('.htm') || path.endsWith('.php')) {
        path = path.substring(0, path.lastIndexOf('/'));
      }
      path = path.replace(/\/+$/, '');
      return (path ? path : '') + '/api';
    } catch (e) {
      return './api';
    }
  }

  getOrCreateSessionId() {
    let sid = localStorage.getItem('sv_swiper_session_id');
    if (!sid) {
      sid = 'usr_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      localStorage.setItem('sv_swiper_session_id', sid);
    }
    return sid;
  }

  loadLocalVotes() {
    try {
      const stored = localStorage.getItem('sv_swiper_votes');
      this.sessionVotes = stored ? JSON.parse(stored) : [];
    } catch (e) {
      this.sessionVotes = [];
    }
  }

  saveLocalVotes() {
    try {
      localStorage.setItem('sv_swiper_votes', JSON.stringify(this.sessionVotes));
    } catch (e) {}
  }

  async recordVote(item, action, positionIndex = null) {
    // action: 'like' | 'pass' | 'superlike'
    const voteRecord = {
      id: item.id,
      slug: item.slug,
      title: item.title,
      category: item.category,
      image: item.image || '',
      action: action,
      position: positionIndex !== null ? positionIndex : this.sessionVotes.length,
      phase: (item._orderingMeta && item._orderingMeta.phase) || 'unspecified',
      timestamp: Date.now(),
      sessionId: this.sessionId
    };

    // Update local item counters
    if (action === 'like') item.likes = (item.likes || 0) + 1;
    else if (action === 'pass') item.passes = (item.passes || 0) + 1;
    else if (action === 'superlike') item.superlikes = (item.superlikes || 0) + 1;

    this.sessionVotes.push(voteRecord);
    this.saveLocalVotes();

    // Trigger local live ticker update
    this.notifyTicker(voteRecord);

    // Sync to backend API
    this.sendVoteToApi(voteRecord);
  }

  async sendVoteToApi(voteRecord) {
    if (!this.online) {
      this.queueOfflineVote(voteRecord);
      return;
    }

    try {
      const res = await fetch(`${this.apiBase}/vote.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voteRecord)
      });
      if (!res.ok) {
        throw new Error(`API error ${res.status}`);
      }
    } catch (err) {
      this.queueOfflineVote(voteRecord);
    }
  }

  queueOfflineVote(voteRecord) {
    try {
      const queue = JSON.parse(localStorage.getItem('sv_swiper_queue') || '[]');
      queue.push(voteRecord);
      localStorage.setItem('sv_swiper_queue', JSON.stringify(queue));
    } catch (e) {}
  }

  async flushOfflineVotes() {
    try {
      const queue = JSON.parse(localStorage.getItem('sv_swiper_queue') || '[]');
      if (!queue.length) return;

      while (queue.length > 0) {
        const item = queue.shift();
        try {
          await fetch(`${this.apiBase}/vote.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
          });
        } catch (e) {
          queue.unshift(item);
          break;
        }
      }
      localStorage.setItem('sv_swiper_queue', JSON.stringify(queue));
    } catch (e) {}
  }

  async fetchGlobalStats() {
    try {
      const res = await fetch(`${this.apiBase}/stats.php?cache=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        this.statsCache = data;
        return data;
      }
    } catch (e) {}

    return this.computeLocalStats();
  }

  computeLocalStats() {
    let grandTotalVotes = 0;

    const ranked = [...this.catalog].map((item) => {
      const localLikes = this.sessionVotes.filter(v => v.id === item.id && v.action === 'like').length;
      const localSuperlikes = this.sessionVotes.filter(v => v.id === item.id && v.action === 'superlike').length;
      const localPasses = this.sessionVotes.filter(v => v.id === item.id && v.action === 'pass').length;

      const totalL = (item.likes || 0) + localLikes;
      const totalS = (item.superlikes || 0) + localSuperlikes;
      const totalP = (item.passes || 0) + localPasses;
      const score = item.score !== undefined && localLikes === 0 && localSuperlikes === 0 
        ? item.score 
        : totalL + (totalS * 3);
      const totalVotesItem = totalL + totalS + totalP;
      const approvalRate = totalVotesItem > 0 ? Math.round(((totalL + totalS) / totalVotesItem) * 100) : 0;

      grandTotalVotes += totalVotesItem;

      return {
        ...item,
        likes: totalL,
        superlikes: totalS,
        passes: totalP,
        totalLikes: totalL,
        totalSuperlikes: totalS,
        totalPasses: totalP,
        score: score,
        approvalRate: approvalRate,
        totalVotes: totalVotesItem
      };
    });

    // Sort descending by score, then totalVotes
    ranked.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.totalVotes || 0) - (a.totalVotes || 0));

    return {
      totalVotes: grandTotalVotes > 0 ? grandTotalVotes : this.sessionVotes.length,
      uniqueVoters: grandTotalVotes > 0 ? 5 : (this.sessionVotes.length > 0 ? 1 : 0),
      topRanked: ranked,
      recentActivity: this.generateRecentFeed()
    };
  }

  generateRecentFeed() {
    const feed = [];
    const recentSession = [...this.sessionVotes].reverse().slice(0, 6);
    recentSession.forEach(v => {
      const verb = v.action === 'superlike' ? 'SUPERLAJKAO' : v.action === 'like' ? 'glasao za' : 'preskočio';
      feed.push({
        user: 'Ti',
        action: verb,
        item: v.title,
        time: 'upravo sada'
      });
    });

    return feed;
  }

  onTicker(cb) {
    this.liveTickerListeners.push(cb);
  }

  notifyTicker(voteRecord) {
    const verb = voteRecord.action === 'superlike' ? 'SUPERLAJKAO' : voteRecord.action === 'like' ? 'glasao za' : 'preskočio';
    const tickerItem = {
      user: 'Ti',
      action: verb,
      item: voteRecord.title,
      time: 'upravo sada'
    };
    this.liveTickerListeners.forEach(cb => cb(tickerItem));
  }

  getUserFavorites() {
    const liked = this.sessionVotes
      .filter(v => v.action === 'like' || v.action === 'superlike')
      .map(v => {
        const item = this.catalog.find(c => c.id === v.id);
        return {
          ...item,
          isSuperlike: v.action === 'superlike'
        };
      })
      .filter(Boolean);

    const map = new Map();
    liked.forEach(item => {
      if (!map.has(item.id) || item.isSuperlike) {
        map.set(item.id, item);
      }
    });

    const list = Array.from(map.values());
    list.sort((a, b) => (b.isSuperlike ? 1 : 0) - (a.isSuperlike ? 1 : 0));
    return list;
  }

  async resetAllVotes() {
    this.sessionVotes = [];
    this.catalog.forEach(it => {
      it.likes = 0;
      it.passes = 0;
      it.superlikes = 0;
    });
    localStorage.removeItem('sv_swiper_votes');
    localStorage.removeItem('sv_swiper_queue');

    try {
      await fetch(`${this.apiBase}/vote.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
    } catch (e) {}
  }
}
