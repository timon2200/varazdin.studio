/**
 * Studio Varaždin — T-Shirt Swiper & Real-Time Analytics Application
 * Meridian 16 & Ponude Master Application Controller (Light & Dark Mode)
 */

import { CATALOG_DATA } from './catalog-data.js';
import { NoiseGrain } from './noise-grain.js';
import { AudioHaptics } from './audio-haptics.js';
import { AnalyticsEngine } from './analytics.js';
import { CardEngine } from './card-engine.js';
import { ShareCardGenerator } from './share-card.js';
import { renderQRCodeToCanvas } from './qr.js';

class SwiperApp {
  constructor() {
    let activeCatalog = CATALOG_DATA;
    try {
      const rawStored = localStorage.getItem("sv_curated_active_ids");
      if (rawStored) {
        const activeIds = new Set(JSON.parse(rawStored));
        if (activeIds.size > 0) {
          const filtered = CATALOG_DATA.filter(it => activeIds.has(it.id));
          if (filtered.length > 0) {
            activeCatalog = filtered;
          }
        }
      }
    } catch (e) {}

    this.catalog = activeCatalog;
    this.noiseGrain = null;
    this.audioHaptics = null;
    this.analytics = null;
    this.cardEngine = null;
    this.shareCardGen = null;
    
    this.currentView = 'swiper'; // 'swiper' | 'grid'
    this.currentTheme = 'light';  // 'light' | 'dark'
    this.activeGridCategory = 'ALL';
    this.gridSearchQuery = '';
    this.gridSortOption = 'default'; // 'default' | 'score-desc' | 'likes-desc' | 'super-desc' | 'votes-desc' | 'title-asc'
    this.gridVoteFilter = 'all';     // 'all' | 'voted' | 'top10'
    
    this.activeLightboxList = [];
    this.lightboxCurrentIndex = 0;
    this.currentFilteredGridItems = [];

    this.currentItem = null;
    this.isDeckCompleted = false;
    this.customFavorites = new Set();

    this.loadCustomFavorites();
    this.init();
  }

  loadCustomFavorites() {
    try {
      const stored = localStorage.getItem('sv_custom_favorites');
      if (stored) {
        this.customFavorites = new Set(JSON.parse(stored));
      }
    } catch (e) {
      this.customFavorites = new Set();
    }
  }

  saveCustomFavorites() {
    try {
      localStorage.setItem('sv_custom_favorites', JSON.stringify(Array.from(this.customFavorites)));
    } catch (e) {}
  }

  async init() {
    // 1. Initialize Theme (Light / Dark)
    this.initTheme();

    // 2. Initialize Subsystems
    this.noiseGrain = new NoiseGrain({ opacity: 0.08, density: 0.65 });
    this.audioHaptics = new AudioHaptics();
    this.analytics = new AnalyticsEngine(this.catalog);
    this.shareCardGen = new ShareCardGenerator();

    // Check URL parameters for reset
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('reset')) {
      await this.analytics.resetAllVotes();
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // 3. Initialize Card Engine (Swiper Mode)
    const stackContainer = document.getElementById('cardStack');
    this.cardEngine = new CardEngine({
      container: stackContainer,
      catalog: this.catalog,
      analytics: this.analytics,
      audioHaptics: this.audioHaptics,
      onVote: (event) => this.handleVote(event),
      onDeckEmpty: () => this.handleDeckEmpty(),
      onCardChange: (event) => this.handleCardChange(event),
      onImageClick: (item) => this.openHighResViewer(item)
    });

    // Set initial deck
    this.cardEngine.setDeck(this.catalog, 'ALL');

    // 4. Initialize Ponude Grid View
    this.initGridView();

    // 5. Bind UI Controls & Modals
    this.bindControls();
    this.bindViewSwitcher();
    this.bindModals();
    this.bindAudioToggle();
    this.bindThemeToggle();
    this.bindKeyboardShortcuts();

    // 6. Update initial counters & badges
    this.updateHeaderCounter();
    this.updateCategoryBadges();

    // 7. Fast background sync with server-curated catalog
    this.syncCuratedCatalog();
  }

  /* ==========================================================================
     THEME SYSTEM (LIGHT & DARK MODE)
     ========================================================================== */
  initTheme() {
    let savedTheme = 'dark';
    try {
      savedTheme = localStorage.getItem('sv_theme') || 'dark';
    } catch (e) {}

    this.setTheme(savedTheme);
  }

  setTheme(theme) {
    this.currentTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = this.currentTheme;
    
    if (this.currentTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    try {
      localStorage.setItem('sv_theme', this.currentTheme);
    } catch (e) {}

    // Update Theme Button Icon
    const sunIcon = document.getElementById('themeIconSun');
    const moonIcon = document.getElementById('themeIconMoon');
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');

    if (sunIcon && moonIcon) {
      if (this.currentTheme === 'dark') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
        if (metaThemeColor) metaThemeColor.setAttribute('content', '#0c100e');
      } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
        if (metaThemeColor) metaThemeColor.setAttribute('content', '#f4efe4');
      }
    }
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
    if (this.audioHaptics) this.audioHaptics.playClick();
    this.showToast(nextTheme === 'dark' ? '🌙 Dark Mode uključen' : '☀️ Light Mode uključen');
  }

  bindThemeToggle() {
    const btn = document.getElementById('btnThemeToggle');
    if (btn) {
      btn.addEventListener('click', () => this.toggleTheme());
    }
  }

  /* ==========================================================================
     VIEW SWITCHER (SWIPER 🎴 VS GRID ▦)
     ========================================================================== */
  bindViewSwitcher() {
    const btnSwiper = document.getElementById('viewBtnSwiper');
    const btnGrid = document.getElementById('viewBtnGrid');
    const btnJumpToGrid = document.getElementById('btnJumpToGrid');

    if (btnSwiper) {
      btnSwiper.addEventListener('click', () => this.setView('swiper'));
    }
    if (btnGrid) {
      btnGrid.addEventListener('click', () => this.setView('grid'));
    }
    if (btnJumpToGrid) {
      btnJumpToGrid.addEventListener('click', () => this.setView('grid'));
    }
  }

  setView(viewName) {
    this.currentView = viewName;
    const swiperStage = document.getElementById('swiperStage');
    const gridView = document.getElementById('catalogGridView');
    const leaderboardView = document.getElementById('leaderboardView');
    const btnSwiper = document.getElementById('viewBtnSwiper');
    const btnGrid = document.getElementById('viewBtnGrid');

    if (btnSwiper && btnGrid) {
      btnSwiper.classList.toggle('active', viewName === 'swiper');
      btnGrid.classList.toggle('active', viewName === 'grid');
    }

    if (viewName === 'swiper') {
      if (leaderboardView) leaderboardView.style.display = 'none';
      if (gridView) gridView.style.display = 'none';
      if (swiperStage) {
        swiperStage.style.display = 'flex';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (viewName === 'grid') {
      if (swiperStage) swiperStage.style.display = 'none';
      if (leaderboardView) leaderboardView.style.display = 'none';
      if (gridView) {
        gridView.style.display = 'flex';
        this.renderGridView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    if (this.audioHaptics) this.audioHaptics.playClick();
  }

  /* ==========================================================================
     PONUDE GRID VIEW (MREŽA & KATALOG)
     ========================================================================== */
  initGridView() {
    const searchInput = document.getElementById('gridSearchInput');
    const searchClear = document.getElementById('gridSearchClear');
    const catNav = document.getElementById('gridCategoryNav');
    const sortSelect = document.getElementById('gridSortSelect');
    const votePills = document.getElementById('gridVoteFilterPills');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.gridSearchQuery = e.target.value.trim().toLowerCase();
        if (searchClear) searchClear.style.display = this.gridSearchQuery ? 'block' : 'none';
        this.renderGridView();
      });
    }

    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.gridSearchQuery = '';
        searchClear.style.display = 'none';
        searchInput.focus();
        this.renderGridView();
      });
    }

    if (catNav) {
      catNav.addEventListener('click', (e) => {
        const btn = e.target.closest('.cat-pill');
        if (!btn) return;
        catNav.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeGridCategory = btn.dataset.cat || 'ALL';
        this.renderGridView();
        if (this.audioHaptics) this.audioHaptics.playClick();
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.gridSortOption = e.target.value;
        this.renderGridView();
        if (this.audioHaptics) this.audioHaptics.playClick();
      });
    }

    if (votePills) {
      votePills.addEventListener('click', (e) => {
        const btn = e.target.closest('.vote-pill');
        if (!btn) return;
        votePills.querySelectorAll('.vote-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.gridVoteFilter = btn.dataset.votefilter || 'all';
        this.renderGridView();
        if (this.audioHaptics) this.audioHaptics.playClick();
      });
    }
  }

  updateCategoryBadges() {
    const counts = {
      ALL: this.catalog.length,
      Selected: 0,
      City: 0,
      Studio: 0,
      Creative: 0,
      Garda: 0,
      Towers: 0,
      Utility: 0,
      Artwear: 0,
      'Front Hits': 0,
      Experimental: 0,
      Favorites: 0
    };

    const favSet = this.getAllUserFavoritesSet();

    this.catalog.forEach(item => {
      const cat = item.category || '';
      if (counts[cat] !== undefined) counts[cat]++;
      if (favSet.has(item.id)) counts.Favorites++;
    });

    for (const [cat, count] of Object.entries(counts)) {
      const key = cat.replace(/\s+/g, '');
      const el = document.getElementById(`gridBadge${key}`);
      if (el) el.textContent = count;
    }
  }

  getAllUserFavoritesSet() {
    const set = new Set(this.customFavorites);
    if (this.analytics && this.analytics.sessionVotes) {
      this.analytics.sessionVotes.forEach(v => {
        if (v.action === 'like' || v.action === 'superlike') {
          set.add(v.id);
        }
      });
    }
    return set;
  }

  renderGridView() {
    const container = document.getElementById('catalogGridContainer');
    const countBadge = document.getElementById('gridResultCount');
    if (!container) return;

    this.updateCategoryBadges();
    const favSet = this.getAllUserFavoritesSet();

    let itemsWithScores = this.catalog.map(item => {
      const localLikes = this.analytics ? this.analytics.sessionVotes.filter(v => v.id === item.id && v.action === 'like').length : 0;
      const localSuper = this.analytics ? this.analytics.sessionVotes.filter(v => v.id === item.id && v.action === 'superlike').length : 0;
      const localPass = this.analytics ? this.analytics.sessionVotes.filter(v => v.id === item.id && v.action === 'pass').length : 0;
      
      const totalL = (item.likes || 0) + localLikes;
      const totalS = (item.superlikes || 0) + localSuper;
      const totalP = (item.passes || 0) + localPass;
      const totalScore = totalL + (totalS * 3);
      const totalVotes = totalL + totalS + totalP;

      return {
        ...item,
        _localLikes: totalL,
        _localSuper: totalS,
        _localPass: totalP,
        _calculatedScore: totalScore,
        _calculatedVotes: totalVotes
      };
    });

    let filtered = itemsWithScores.filter(item => {
      // Category Filter
      if (this.activeGridCategory === 'Favorites') {
        if (!favSet.has(item.id)) return false;
      } else if (this.activeGridCategory !== 'ALL') {
        if ((item.category || '').toLowerCase() !== this.activeGridCategory.toLowerCase()) {
          return false;
        }
      }

      // Vote Filter (all, voted, top10)
      if (this.gridVoteFilter === 'voted') {
        if (item._calculatedVotes <= 0) return false;
      }

      // Text Search Filter
      if (this.gridSearchQuery) {
        const titleMatch = (item.title || '').toLowerCase().includes(this.gridSearchQuery);
        const catMatch = (item.category || '').toLowerCase().includes(this.gridSearchQuery);
        const idMatch = (item.id || '').toLowerCase().includes(this.gridSearchQuery);
        const tagsMatch = Array.isArray(item.tags) && item.tags.some(t => t.toLowerCase().includes(this.gridSearchQuery));
        return titleMatch || catMatch || idMatch || tagsMatch;
      }

      return true;
    });

    // Sorting
    if (this.gridSortOption === 'score-desc' || this.gridVoteFilter === 'top10') {
      filtered.sort((a, b) => b._calculatedScore - a._calculatedScore || b._calculatedVotes - a._calculatedVotes);
    } else if (this.gridSortOption === 'likes-desc') {
      filtered.sort((a, b) => b._localLikes - a._localLikes || b._calculatedScore - a._calculatedScore);
    } else if (this.gridSortOption === 'super-desc') {
      filtered.sort((a, b) => b._localSuper - a._localSuper || b._calculatedScore - a._calculatedScore);
    } else if (this.gridSortOption === 'votes-desc') {
      filtered.sort((a, b) => b._calculatedVotes - a._calculatedVotes || b._calculatedScore - a._calculatedScore);
    } else if (this.gridSortOption === 'title-asc') {
      filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    if (this.gridVoteFilter === 'top10') {
      filtered = filtered.slice(0, 10);
    }

    this.currentFilteredGridItems = filtered;

    if (countBadge) {
      countBadge.textContent = filtered.length;
    }

    container.innerHTML = '';

    if (!filtered.length) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; background: var(--bg-card); border: 2px dashed var(--border-dark); border-radius: var(--radius-md);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
          <h3 style="font-family: var(--font-hero); font-size: 1.2rem; color: var(--text-primary); margin-bottom: 0.25rem;">NEMA PRONAĐENIH MOTIVA</h3>
          <p style="font-size: 0.88rem; color: var(--text-muted);">Pokušaj s drugim pojmom pretrage ili odaberi drugi filter glasova/kategoriju.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(item => {
      const card = this.createGridCardElement(item, favSet.has(item.id), filtered);
      container.appendChild(card);
    });
  }

  createGridCardElement(item, isFav, currentList = null) {
    const card = document.createElement('article');
    card.className = 'tshirt-grid-card';
    card.dataset.id = item.id;

    const optSrc = this.resolveImageUrl(item);
    const cat = item.category || 'ARTWEAR';
    const badgeClass = cat === 'Selected' ? 'badge-gold' : cat === 'City' ? 'badge-blue' : 'badge-green';

    const localLikes = item._localLikes !== undefined ? item._localLikes : ((item.likes || 0) + (this.analytics ? this.analytics.sessionVotes.filter(v => v.id === item.id && v.action === 'like').length : 0));
    const localSuper = item._localSuper !== undefined ? item._localSuper : ((item.superlikes || 0) + (this.analytics ? this.analytics.sessionVotes.filter(v => v.id === item.id && v.action === 'superlike').length : 0));
    const localPass = item._localPass !== undefined ? item._localPass : ((item.passes || 0) + (this.analytics ? this.analytics.sessionVotes.filter(v => v.id === item.id && v.action === 'pass').length : 0));
    const totalScore = item._calculatedScore !== undefined ? item._calculatedScore : (localLikes + (localSuper * 3));

    card.innerHTML = `
      <span class="card-tag ${badgeClass}">[ ${cat.toUpperCase()} ]</span>
      <button class="card-fav-btn ${isFav ? 'active' : ''}" title="Označi kao favorit" aria-label="Favorit">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </button>

      <div class="card-thumb-crazy" title="Klikni za 2K zoom pregled">
        <img src="${optSrc}" alt="${item.title}" loading="lazy">
        <div class="scanline-overlay"></div>
      </div>

      <div class="card-info-crazy">
        <div class="card-header-row">
          <span class="card-cat-label">${cat.toUpperCase()} SERIES · cCc</span>
          <h3 class="card-title-crazy">${item.title}</h3>
        </div>

        <div class="card-stats-row">
          <div class="stats-group">
            <span class="stat-item stat-like" title="Glasovi Sviđa mi se">♥ <span class="val-likes">${(item.likes || 0) + localLikes}</span></span>
            <span class="stat-item stat-super" title="Superlike glasovi">★ <span class="val-super">${(item.superlikes || 0) + localSuper}</span></span>
            <span class="stat-item stat-pass" title="Preskočeno">✕ <span class="val-pass">${(item.passes || 0) + localPass}</span></span>
          </div>
          <span class="stat-score-pill">SKOR: ${totalScore}</span>
        </div>

        <div class="card-actions-grid">
          <button class="btn-card-action btn-card-like" title="Glasaj Sviđa mi se">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            <span>LAJKAJ</span>
          </button>
          <button class="btn-card-action btn-card-superlike" title="Superlike (3x bodovi)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          </button>
          <button class="btn-card-action btn-card-pass" title="Preskoči">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <button class="btn-card-action btn-card-zoom" title="2K Zumiranje i detalji">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
        </div>
      </div>
    `;

    // Bind card events
    const thumb = card.querySelector('.card-thumb-crazy');
    const favBtn = card.querySelector('.card-fav-btn');
    const btnLike = card.querySelector('.btn-card-like');
    const btnSuper = card.querySelector('.btn-card-superlike');
    const btnPass = card.querySelector('.btn-card-pass');
    const btnZoom = card.querySelector('.btn-card-zoom');

    if (thumb) {
      thumb.addEventListener('click', () => this.openHighResViewer(item));
    }

    if (btnZoom) {
      btnZoom.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openHighResViewer(item);
      });
    }

    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCustomFavorite(item.id, favBtn);
      });
    }

    if (btnLike) {
      btnLike.addEventListener('click', (e) => {
        e.stopPropagation();
        this.recordGridVote(item, 'like', card);
      });
    }

    if (btnSuper) {
      btnSuper.addEventListener('click', (e) => {
        e.stopPropagation();
        this.recordGridVote(item, 'superlike', card);
      });
    }

    if (btnPass) {
      btnPass.addEventListener('click', (e) => {
        e.stopPropagation();
        this.recordGridVote(item, 'pass', card);
      });
    }

    return card;
  }

  toggleCustomFavorite(id, favBtnEl) {
    if (this.customFavorites.has(id)) {
      this.customFavorites.delete(id);
      if (favBtnEl) {
        favBtnEl.classList.remove('active');
        const svg = favBtnEl.querySelector('svg');
        if (svg) svg.setAttribute('fill', 'none');
      }
      this.showToast('Odstranjeno iz favorita');
    } else {
      this.customFavorites.add(id);
      if (favBtnEl) {
        favBtnEl.classList.add('active');
        const svg = favBtnEl.querySelector('svg');
        if (svg) svg.setAttribute('fill', 'currentColor');
      }
      this.showToast('★ Dodano u favorite!');
    }
    this.saveCustomFavorites();
    this.updateCategoryBadges();
    if (this.audioHaptics) this.audioHaptics.playClick();
  }

  async recordGridVote(item, action, cardEl) {
    if (this.analytics) {
      await this.analytics.recordVote(item, action);
    }
    if (this.audioHaptics) {
      this.audioHaptics.playSwipe(action);
    }
    this.updateHeaderCounter();
    this.updateCategoryBadges();

    // Update numbers on the card live
    const localLikes = this.analytics.sessionVotes.filter(v => v.id === item.id && v.action === 'like').length;
    const localSuper = this.analytics.sessionVotes.filter(v => v.id === item.id && v.action === 'superlike').length;
    const localPass = this.analytics.sessionVotes.filter(v => v.id === item.id && v.action === 'pass').length;
    const totalScore = (item.likes || 0) + localLikes + ((item.superlikes || 0) + localSuper) * 3;

    const valLikes = cardEl.querySelector('.val-likes');
    const valSuper = cardEl.querySelector('.val-super');
    const valPass = cardEl.querySelector('.val-pass');
    const scorePill = cardEl.querySelector('.stat-score-pill');

    if (valLikes) valLikes.textContent = (item.likes || 0) + localLikes;
    if (valSuper) valSuper.textContent = (item.superlikes || 0) + localSuper;
    if (valPass) valPass.textContent = (item.passes || 0) + localPass;
    if (scorePill) scorePill.textContent = `SKOR: ${totalScore}`;

    const verb = action === 'superlike' ? '★ Superlike zabilježen!' : action === 'like' ? '✓ Lajk zabilježen!' : '✕ Preskočeno';
    this.showToast(`${verb} (${item.title})`);
  }

  /* ==========================================================================
     SERVER CURATION SYNC
     ========================================================================== */
  async syncCuratedCatalog() {
    try {
      // 1. Sync Active Round
      const roundsRes = await fetch('api/rounds.php?t=' + Date.now(), { cache: 'no-store' });
      if (roundsRes.ok) {
        const roundsData = await roundsRes.json();
        if (roundsData.status === 'success' && roundsData.activeRound) {
          const badgeEl = document.getElementById('headerRoundBadge');
          if (badgeEl) {
            badgeEl.textContent = `${roundsData.activeRound}. KOLO`;
          }
        }
      }
    } catch (e) {}

    try {
      const res = await fetch('api/curate.php?t=' + Date.now(), {
        cache: 'no-store',
        headers: { 'Pragma': 'no-cache' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.active) && data.active.length > 0) {
          const currentIds = this.catalog.map(it => it.id).join(',');
          const serverIds = data.active.map(it => it.id).join(',');
          if (currentIds !== serverIds) {
            this.catalog = data.active;
            try {
              localStorage.setItem('sv_curated_active_ids', JSON.stringify(data.active.map(it => it.id)));
            } catch (e) {}
            if (this.analytics) {
              this.analytics.catalog = this.catalog;
            }
            if (this.cardEngine) {
              this.cardEngine.catalog = this.catalog;
              this.cardEngine.setDeck(this.catalog, 'ALL');
            }
            this.updateHeaderCounter();
            this.updateCategoryBadges();
            if (this.currentView === 'grid') {
              this.renderGridView();
            }
          }
        }
      }
    } catch (e) {
      // Offline / Static fallback
    }
  }

  /* ==========================================================================
     CONTROLS & MODALS BINDINGS
     ========================================================================== */
  bindControls() {
    const btnPass = document.getElementById('btnPass');
    const btnLike = document.getElementById('btnLike');
    const btnSuper = document.getElementById('btnSuperlike');
    const btnUndo = document.getElementById('btnUndo');
    const btnInfo = document.getElementById('btnInfo');

    if (btnPass) btnPass.addEventListener('click', () => this.cardEngine.swipeAction('left'));
    if (btnLike) btnLike.addEventListener('click', () => this.cardEngine.swipeAction('right'));
    if (btnSuper) btnSuper.addEventListener('click', () => this.cardEngine.swipeAction('superlike'));
    if (btnUndo) btnUndo.addEventListener('click', () => this.cardEngine.undo());
    if (btnInfo) btnInfo.addEventListener('click', () => this.openInfoModal());

    // Swiper Bottom Bar: Open Leaderboard
    const btnOpenLeaderboard = document.getElementById('btnOpenLeaderboard');
    if (btnOpenLeaderboard) {
      btnOpenLeaderboard.addEventListener('click', () => this.openLeaderboardView());
    }

    // Leaderboard Action Buttons
    const btnBackToSwiper = document.getElementById('btnBackToSwiper');
    const btnShareViral = document.getElementById('btnShareViral');
    const btnShareLeaderboard = document.getElementById('btnShareLeaderboard');
    const btnExportStory = document.getElementById('btnExportStory');
    const btnResetVotes = document.getElementById('btnResetVotes');
    const btnRestartDeck = document.getElementById('btnRestartDeck');

    if (btnBackToSwiper) btnBackToSwiper.addEventListener('click', () => this.setView('swiper'));
    if (btnShareViral) btnShareViral.addEventListener('click', () => this.openShareModal());
    if (btnShareLeaderboard) btnShareLeaderboard.addEventListener('click', () => this.openShareModal());
    if (btnExportStory) btnExportStory.addEventListener('click', () => this.exportTop3Story());
    if (btnResetVotes) btnResetVotes.addEventListener('click', () => this.confirmResetVotes());
    if (btnRestartDeck) btnRestartDeck.addEventListener('click', () => this.restartDeck());
  }

  async openLeaderboardView() {
    const swiperStage = document.getElementById('swiperStage');
    const gridView = document.getElementById('catalogGridView');
    const leaderboardView = document.getElementById('leaderboardView');
    const btnSwiper = document.getElementById('viewBtnSwiper');
    const btnGrid = document.getElementById('viewBtnGrid');

    if (btnSwiper && btnGrid) {
      btnSwiper.classList.remove('active');
      btnGrid.classList.remove('active');
    }

    if (swiperStage) swiperStage.style.display = 'none';
    if (gridView) gridView.style.display = 'none';
    if (leaderboardView) {
      leaderboardView.style.display = 'flex';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (this.audioHaptics) this.audioHaptics.playClick();

    await this.renderTop3Fan();
    await this.refreshLeaderboard();
  }

  bindModals() {
    // Info Modal
    const modalInfo = document.getElementById('modalInfo');
    const closeInfo = document.getElementById('closeModalInfo');
    const btnOpenHighRes = document.getElementById('btnOpenHighRes');

    if (closeInfo && modalInfo) {
      closeInfo.addEventListener('click', () => modalInfo.classList.remove('active'));
      modalInfo.addEventListener('click', (e) => {
        if (e.target === modalInfo) modalInfo.classList.remove('active');
      });
    }

    if (btnOpenHighRes) {
      btnOpenHighRes.addEventListener('click', () => {
        if (this.currentItem) this.openHighResViewer(this.currentItem);
      });
    }

    // High Res Viewer Modal & Lightbox Controls
    const modalZoom = document.getElementById('modalZoom');
    const closeZoom = document.getElementById('closeModalZoom');
    const btnPrev = document.getElementById('btnLightboxPrev');
    const btnNext = document.getElementById('btnLightboxNext');

    if (closeZoom && modalZoom) {
      closeZoom.addEventListener('click', () => this.closeHighResViewer());
      modalZoom.addEventListener('click', (e) => {
        if (e.target === modalZoom || e.target.classList.contains('lightbox-img-container')) {
          this.closeHighResViewer();
        }
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        this.prevLightboxItem();
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', (e) => {
        e.stopPropagation();
        this.nextLightboxItem();
      });
    }

    // Touch swipe support for lightbox on mobile
    if (modalZoom) {
      let touchStartX = 0;
      let touchEndX = 0;
      modalZoom.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
        }
      }, { passive: true });

      modalZoom.addEventListener('touchend', (e) => {
        if (e.changedTouches && e.changedTouches[0]) {
          touchEndX = e.changedTouches[0].clientX;
          const diff = touchEndX - touchStartX;
          if (Math.abs(diff) > 40) {
            if (diff > 0) this.prevLightboxItem();
            else this.nextLightboxItem();
          }
        }
      }, { passive: true });
    }

    // Share Modal
    const modalShare = document.getElementById('modalShare');
    const closeShare = document.getElementById('closeModalShare');
    if (closeShare && modalShare) {
      closeShare.addEventListener('click', () => modalShare.classList.remove('active'));
      modalShare.addEventListener('click', (e) => {
        if (e.target === modalShare) modalShare.classList.remove('active');
      });
    }

    // Copy Link Action
    const btnCopyLink = document.getElementById('btnCopyLink');
    if (btnCopyLink) {
      btnCopyLink.addEventListener('click', () => {
        const url = window.location.origin + window.location.pathname;
        navigator.clipboard.writeText(url).then(() => {
          this.showToast('✓ Poveznica kopirana u međuspremnik!');
        }).catch(() => {
          this.showToast('✓ Link: ' + url);
        });
      });
    }
  }

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const modalZoom = document.getElementById('modalZoom');
      const isLightboxActive = modalZoom && modalZoom.classList.contains('active');

      // Lightbox Gallery Arrow Navigation
      if (isLightboxActive) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.prevLightboxItem();
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.nextLightboxItem();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this.closeHighResViewer();
          return;
        }
      }

      // ⌘K or / to focus search
      if ((e.metaKey && e.key === 'k') || (e.ctrlKey && e.key === 'k') || (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) {
        e.preventDefault();
        this.setView('grid');
        const input = document.getElementById('gridSearchInput');
        if (input) {
          input.focus();
          input.select();
        }
      }

      // Shift + R to reset votes
      if (e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        this.confirmResetVotes();
      }

      // T to toggle theme (if not inside an input)
      if ((e.key === 't' || e.key === 'T') && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
        this.toggleTheme();
      }

      // V to toggle view
      if ((e.key === 'v' || e.key === 'V') && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
        this.setView(this.currentView === 'swiper' ? 'grid' : 'swiper');
      }
    });
  }

  bindAudioToggle() {
    const btnAudio = document.getElementById('btnAudioToggle');
    if (!btnAudio) return;

    btnAudio.addEventListener('click', () => {
      const isEnabled = this.audioHaptics.toggleSound();
      btnAudio.style.opacity = isEnabled ? '1' : '0.4';
      this.showToast(isEnabled ? '🔊 Zvuk uključen' : '🔇 Zvuk isključen');
    });
  }

  handleCardChange({ item, index, total, hasUndo }) {
    this.currentItem = item;
    const btnUndo = document.getElementById('btnUndo');
    if (btnUndo) {
      btnUndo.disabled = !hasUndo;
    }

    const cardCounter = document.getElementById('cardCounter');
    if (cardCounter) {
      cardCounter.textContent = `${index + 1} / ${total}`;
    }
  }

  handleVote({ item, action, currentIndex, totalCards }) {
    this.updateHeaderCounter();
    this.updateCategoryBadges();
    if (this.isDeckCompleted) {
      this.refreshLeaderboard();
      this.renderTop3Fan();
    }
  }

  /**
   * Called when user finishes swiping the entire deck.
   * Hides the swiper and reveals the full Leaderboard & Top 3 showcase view!
   */
  async handleDeckEmpty() {
    this.isDeckCompleted = true;
    
    const swiperStage = document.getElementById('swiperStage');
    const gridView = document.getElementById('catalogGridView');
    const leaderboardView = document.getElementById('leaderboardView');

    if (swiperStage) swiperStage.style.display = 'none';
    if (gridView) gridView.style.display = 'none';
    if (leaderboardView) {
      leaderboardView.style.display = 'flex';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    try {
      if (this.audioHaptics) {
        this.audioHaptics.playSwipe('superlike');
      }
    } catch (e) {}

    await this.renderTop3Fan();
    await this.refreshLeaderboard();
  }

  /**
   * Resets the deck and brings the user back to the centered swiper view.
   */
  restartDeck() {
    this.isDeckCompleted = false;

    const swiperStage = document.getElementById('swiperStage');
    const gridView = document.getElementById('catalogGridView');
    const leaderboardView = document.getElementById('leaderboardView');

    if (leaderboardView) leaderboardView.style.display = 'none';
    if (gridView) gridView.style.display = 'none';
    if (swiperStage) {
      swiperStage.style.display = 'flex';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    this.cardEngine.shuffle();
  }

  resolveImageUrl(itemOrImage) {
    if (!itemOrImage) return '';
    let raw = typeof itemOrImage === 'string' ? itemOrImage : (itemOrImage.image || '');
    if (!raw && typeof itemOrImage === 'object') {
      const found = this.catalog.find(c => 
        (itemOrImage.id && c.id === itemOrImage.id) || 
        (itemOrImage.title && c.title === itemOrImage.title) || 
        (itemOrImage.slug && c.slug === itemOrImage.slug)
      );
      if (found) raw = found.image;
    }
    if (!raw) return '';
    const opt = raw.includes('assets/optimized/') ? raw : raw.replace('assets/designs/', 'assets/optimized/').replace(/\.(png|jpg)$/, '.webp');
    return encodeURI(opt);
  }

  /* ==========================================================================
     TOP 3 FAN & LEADERBOARD RENDERING (BIG CARDS, ZERO PADDING)
     ========================================================================== */
  async renderTop3Fan() {
    const fanContainer = document.getElementById('top3CardsFan');
    if (!fanContainer) return;

    const stats = await this.analytics.fetchGlobalStats();
    let topRanked = stats.topRanked || [];

    // Fallback if no votes recorded yet
    if (topRanked.length === 0) {
      const favs = this.analytics.getUserFavorites();
      topRanked = favs.length > 0 ? favs : this.catalog.slice(0, 3);
    }

    const rank1 = topRanked[0] || this.catalog[0] || null;
    const rank2 = topRanked[1] || this.catalog[1] || null;
    const rank3 = topRanked[2] || this.catalog[2] || null;

    fanContainer.innerHTML = '';

    // Card 2 (Left): -20deg, middle height
    if (rank2) {
      const card2El = this.createFanCardElement(rank2, 2, 'fan-rank-2', '★ #2 MJESTO', topRanked);
      fanContainer.appendChild(card2El);
    }

    // Card 1 (Center): 2deg, HIGHEST height
    if (rank1) {
      const card1El = this.createFanCardElement(rank1, 1, 'fan-rank-1', '👑 #1 FAVORIT', topRanked);
      fanContainer.appendChild(card1El);
    }

    // Card 3 (Right): 23deg, LOWEST height
    if (rank3) {
      const card3El = this.createFanCardElement(rank3, 3, 'fan-rank-3', '★ #3 MJESTO', topRanked);
      fanContainer.appendChild(card3El);
    }
  }

  createFanCardElement(item, rankNum, modifierClass, badgeText, activeList = null) {
    const card = document.createElement('div');
    card.className = `fan-card ${modifierClass}`;
    card.title = `Klikni za puni 2K prikaz: ${item.title}`;

    const optSrc = this.resolveImageUrl(item);
    const scoreVal = item.score !== undefined ? item.score : (item.likes || 0);
    const scoreText = scoreVal + ' PTS';
    const badgeClass = rankNum === 1 ? 'fan-badge-1' : rankNum === 2 ? 'fan-badge-2' : 'fan-badge-3';

    card.innerHTML = `
      <span class="fan-badge ${badgeClass}">${badgeText}</span>
      <div class="fan-image-box">
        <img src="${optSrc}" alt="${item.title}" loading="lazy">
      </div>
      <div class="fan-meta">
        <div class="fan-title">${item.title}</div>
        <div class="fan-score">${scoreText}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      this.openHighResViewer(item, activeList);
    });

    return card;
  }

  async refreshLeaderboard() {
    const stats = await this.analytics.fetchGlobalStats();
    const listEl = document.getElementById('leaderboardList');
    const totalVotesLabel = document.getElementById('leaderboardTotalVotesLabel');
    if (!listEl) return;

    let items = stats.topRanked || [];

    // Fallback or merge with catalog if no backend votes yet
    if (!items.length) {
      items = [...this.catalog].map(it => {
        const localLikes = this.analytics ? this.analytics.sessionVotes.filter(v => v.id === it.id && v.action === 'like').length : 0;
        const localSuper = this.analytics ? this.analytics.sessionVotes.filter(v => v.id === it.id && v.action === 'superlike').length : 0;
        const localPass = this.analytics ? this.analytics.sessionVotes.filter(v => v.id === it.id && v.action === 'pass').length : 0;
        const total = localLikes + localSuper + localPass;
        const score = (it.likes || 0) + localLikes + (((it.superlikes || 0) + localSuper) * 3);
        return {
          ...it,
          likes: (it.likes || 0) + localLikes,
          superlikes: (it.superlikes || 0) + localSuper,
          passes: (it.passes || 0) + localPass,
          score: score,
          totalVotes: total,
          approvalRate: total > 0 ? Math.round(((localLikes + localSuper) / total) * 100) : 0
        };
      });
      items.sort((a, b) => b.score - a.score);
    }

    if (totalVotesLabel) {
      totalVotesLabel.textContent = `GLASOVA: ${(stats.totalVotes || items.length).toLocaleString()}`;
    }

    listEl.innerHTML = '';

    if (!items.length) {
      listEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding: 2.5rem 1.5rem; color: var(--text-muted);">
          <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">⚔️</div>
          <p style="font-family:var(--font-hero); font-weight: 800; color: var(--accent-gold); margin-bottom: 4px;">GLASANJE JE UPRAVO OTVORENO</p>
          <p style="font-size: 0.88rem;">Glasaj za motive u špilu ili mreži za ulazak na rang listu!</p>
        </div>
      `;
      return;
    }

    items.forEach((it, idx) => {
      const optSrc = this.resolveImageUrl(it);
      const rank = idx + 1;
      const rankBadgeClass = rank === 1 ? 'rank-badge-1' : rank === 2 ? 'rank-badge-2' : rank === 3 ? 'rank-badge-3' : 'rank-badge-other';
      const rankText = rank === 1 ? '👑 #1' : rank === 2 ? '★ #2' : rank === 3 ? '★ #3' : `#${rank}`;
      const cat = (it.category || 'ARTWEAR').toUpperCase();
      const score = it.score !== undefined ? it.score : ((it.likes || 0) + ((it.superlikes || 0) * 3));
      const likes = it.likes || 0;
      const superlikes = it.superlikes || 0;
      const passes = it.passes || 0;

      const card = document.createElement('article');
      card.className = 'leaderboard-card';
      card.dataset.id = it.id;
      card.title = `Klikni za puni 2K prikaz: ${it.title}`;

      card.innerHTML = `
        <span class="rank-floating-badge ${rankBadgeClass}">${rankText}</span>
        <span class="leaderboard-cat-tag">${cat}</span>

        <div class="leaderboard-card-img-wrap">
          <img src="${optSrc}" alt="${it.title}" class="leaderboard-card-img" loading="${idx < 8 ? 'eager' : 'lazy'}">
          <div class="scanline-overlay"></div>
        </div>

        <div class="leaderboard-card-info">
          <h3 class="leaderboard-card-title">${it.title}</h3>
          
          <div class="leaderboard-stats-row">
            <span class="leaderboard-score-pill">★ ${score.toLocaleString()} BODOVA</span>
            <div class="leaderboard-votes-breakdown">
              <span style="color:var(--accent-green); font-weight:800;" title="Lajkovi">♥ ${likes}</span>
              <span style="color:var(--accent-gold); font-weight:800;" title="Superlike">★ ${superlikes}</span>
              <span style="color:var(--text-muted);" title="Preskočeno">✕ ${passes}</span>
            </div>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.openHighResViewer(it, items);
      });

      listEl.appendChild(card);
    });
  }

  updateHeaderCounter() {
    const counterEl = document.getElementById('headerVoteCount');
    if (counterEl) {
      const total = this.analytics.sessionVotes.length;
      counterEl.textContent = total.toLocaleString();
    }
  }

  openInfoModal() {
    if (!this.currentItem) return;
    const modalInfo = document.getElementById('modalInfo');
    const infoImg = document.getElementById('infoImage');
    const infoTitle = document.getElementById('infoTitle');
    const infoCat = document.getElementById('infoCategory');
    const infoDesc = document.getElementById('infoDesc');

    if (infoImg) infoImg.src = this.resolveImageUrl(this.currentItem);
    if (infoTitle) infoTitle.textContent = this.currentItem.title;
    if (infoCat) infoCat.textContent = `${(this.currentItem.category || 'ARTWEAR').toUpperCase()} SERIES`;
    if (infoDesc) infoDesc.textContent = this.currentItem.description;

    if (modalInfo) modalInfo.classList.add('active');
  }

  /* ==========================================================================
     LIGHTBOX 2K GALLERY VIEWER WITH ARROW KEYS NAVIGATION
     ========================================================================== */
  openHighResViewer(itemOrSrc, customList = null) {
    // 1. Establish the active gallery array
    if (Array.isArray(customList) && customList.length > 0) {
      this.activeLightboxList = customList;
    } else if (this.currentView === 'grid' && this.currentFilteredGridItems.length > 0) {
      this.activeLightboxList = this.currentFilteredGridItems;
    } else {
      this.activeLightboxList = this.catalog;
    }

    // 2. Find target item index
    let targetIndex = 0;
    if (typeof itemOrSrc === 'object' && itemOrSrc !== null) {
      const foundIdx = this.activeLightboxList.findIndex(it => 
        (itemOrSrc.id && it.id === itemOrSrc.id) ||
        (itemOrSrc.slug && it.slug === itemOrSrc.slug) ||
        (itemOrSrc.title && it.title === itemOrSrc.title)
      );
      if (foundIdx !== -1) targetIndex = foundIdx;
    } else if (typeof itemOrSrc === 'string') {
      const foundIdx = this.activeLightboxList.findIndex(it => {
        const resolved = this.resolveImageUrl(it);
        return resolved === itemOrSrc || it.image === itemOrSrc;
      });
      if (foundIdx !== -1) targetIndex = foundIdx;
    }

    this.lightboxCurrentIndex = targetIndex;
    this.renderLightboxItem();

    const modalZoom = document.getElementById('modalZoom');
    if (modalZoom) {
      modalZoom.classList.add('active');
    }
  }

  renderLightboxItem() {
    const modalZoom = document.getElementById('modalZoom');
    const zoomImg = document.getElementById('zoomImage');
    const zoomTitle = document.getElementById('zoomTitle');
    const zoomCat = document.getElementById('zoomCategory');
    const zoomId = document.getElementById('zoomId');
    const zoomPoints = document.getElementById('zoomPoints');
    const zoomCounter = document.getElementById('zoomCounter');

    if (!modalZoom || !zoomImg) return;

    const currentItem = this.activeLightboxList[this.lightboxCurrentIndex] || this.currentItem || this.catalog[0];
    if (!currentItem) return;

    zoomImg.src = this.resolveImageUrl(currentItem);
    if (zoomTitle) zoomTitle.textContent = currentItem.title || 'Motiv';
    if (zoomCat) zoomCat.textContent = (currentItem.category || 'ARTWEAR').toUpperCase();
    if (zoomId) zoomId.textContent = currentItem.id ? `#${currentItem.id}` : '';

    const localLikes = this.analytics ? this.analytics.sessionVotes.filter(v => v.id === currentItem.id && v.action === 'like').length : 0;
    const localSuper = this.analytics ? this.analytics.sessionVotes.filter(v => v.id === currentItem.id && v.action === 'superlike').length : 0;
    const scoreVal = currentItem.score !== undefined ? currentItem.score : ((currentItem.likes || 0) + localLikes + (((currentItem.superlikes || 0) + localSuper) * 3));

    if (zoomPoints) {
      zoomPoints.textContent = `★ ${scoreVal} PTS`;
      zoomPoints.style.display = 'inline-block';
    }

    if (zoomCounter) {
      zoomCounter.textContent = `${this.lightboxCurrentIndex + 1} / ${this.activeLightboxList.length}`;
    }

    // Preload next and previous images
    if (this.activeLightboxList.length > 1) {
      const nextIdx = (this.lightboxCurrentIndex + 1) % this.activeLightboxList.length;
      const prevIdx = (this.lightboxCurrentIndex - 1 + this.activeLightboxList.length) % this.activeLightboxList.length;
      const preloadNext = new Image();
      preloadNext.src = this.resolveImageUrl(this.activeLightboxList[nextIdx]);
      const preloadPrev = new Image();
      preloadPrev.src = this.resolveImageUrl(this.activeLightboxList[prevIdx]);
    }
  }

  nextLightboxItem() {
    if (!this.activeLightboxList.length) return;
    this.lightboxCurrentIndex = (this.lightboxCurrentIndex + 1) % this.activeLightboxList.length;
    this.renderLightboxItem();
    if (this.audioHaptics) this.audioHaptics.playClick();
  }

  prevLightboxItem() {
    if (!this.activeLightboxList.length) return;
    this.lightboxCurrentIndex = (this.lightboxCurrentIndex - 1 + this.activeLightboxList.length) % this.activeLightboxList.length;
    this.renderLightboxItem();
    if (this.audioHaptics) this.audioHaptics.playClick();
  }

  closeHighResViewer() {
    const modalZoom = document.getElementById('modalZoom');
    if (modalZoom) {
      modalZoom.classList.remove('active');
    }
  }

  openShareModal() {
    const modalShare = document.getElementById('modalShare');
    if (modalShare) {
      const qrCanvas = document.getElementById('qrCanvas');
      const shareUrl = window.location.origin + window.location.pathname;
      if (qrCanvas) {
        renderQRCodeToCanvas(shareUrl, qrCanvas, 160);
      }
      modalShare.classList.add('active');
    }
  }

  async confirmResetVotes() {
    if (confirm('Želiš li poništiti sve glasove i započeti glasanje od 0?')) {
      await this.analytics.resetAllVotes();
      this.cardEngine.setDeck(this.catalog, 'ALL');
      this.updateHeaderCounter();
      this.updateCategoryBadges();
      if (this.currentView === 'grid') {
        this.renderGridView();
      }
      if (this.isDeckCompleted) {
        this.renderTop3Fan();
        this.refreshLeaderboard();
      }
      this.showToast('✓ Svi glasovi su uspješno resetirani na 0!');
    }
  }

  async exportTop3Story() {
    const stats = await this.analytics.fetchGlobalStats();
    let favorites = this.analytics.getUserFavorites();

    if (!favorites.length && stats.topRanked && stats.topRanked.length > 0) {
      favorites = stats.topRanked.slice(0, 3);
    }

    if (!favorites.length) {
      this.showToast('⚠️ Prvo glasaj za barem jedan dizajn!');
      return;
    }

    this.showToast('⚡ Generiram 1080x1920 Story karticu...');
    try {
      await this.shareCardGen.shareOrDownload(favorites);
      this.showToast('✓ Slika uspješno izvezena!');
    } catch (e) {
      this.showToast('Greška pri izvozu slike.');
    }
  }

  showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }
}

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.swiperApp = new SwiperApp();
});
