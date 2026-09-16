/**
 * Studio Varaždin — T-Shirt Swiper & Real-Time Analytics Application
 * Master Application Controller
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
    this.activeCategory = 'ALL';
    this.currentItem = null;
    this.isDeckCompleted = false;

    this.init();
  }

  async init() {
    // 1. Initialize Subsystems
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

    // 2. Initialize Card Engine
    const stackContainer = document.getElementById('cardStack');
    this.cardEngine = new CardEngine({
      container: stackContainer,
      catalog: this.catalog,
      analytics: this.analytics,
      audioHaptics: this.audioHaptics,
      onVote: (event) => this.handleVote(event),
      onDeckEmpty: () => this.handleDeckEmpty(),
      onCardChange: (event) => this.handleCardChange(event)
    });

    // Set initial deck
    this.cardEngine.setDeck(this.catalog, 'ALL');

    // 3. Bind UI Events & Controls
    this.bindControls();
    this.bindModals();
    this.bindAudioToggle();
    this.bindKeyboardShortcuts();

    // 4. Update initial header vote counter
    this.updateHeaderCounter();

    // 5. Fast background sync with server-curated catalog
    this.syncCuratedCatalog();
  }

  async syncCuratedCatalog() {
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
          }
        }
      }
    } catch (e) {
      // Offline / Static fallback
    }
  }

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

    // Viral Share & Action Buttons
    const btnShareViral = document.getElementById('btnShareViral');
    const btnShareLeaderboard = document.getElementById('btnShareLeaderboard');
    const btnExportStory = document.getElementById('btnExportStory');
    const btnFavorites = document.getElementById('btnFavorites');
    const btnResetVotes = document.getElementById('btnResetVotes');
    const btnRestartDeck = document.getElementById('btnRestartDeck');

    if (btnShareViral) btnShareViral.addEventListener('click', () => this.openShareModal());
    if (btnShareLeaderboard) btnShareLeaderboard.addEventListener('click', () => this.openShareModal());
    if (btnExportStory) btnExportStory.addEventListener('click', () => this.exportTop3Story());
    if (btnFavorites) btnFavorites.addEventListener('click', () => this.openFavoritesModal());
    if (btnResetVotes) btnResetVotes.addEventListener('click', () => this.confirmResetVotes());
    if (btnRestartDeck) btnRestartDeck.addEventListener('click', () => this.restartDeck());
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

    // High Res Viewer Modal
    const modalZoom = document.getElementById('modalZoom');
    const closeZoom = document.getElementById('closeModalZoom');
    if (closeZoom && modalZoom) {
      closeZoom.addEventListener('click', () => modalZoom.classList.remove('active'));
      modalZoom.addEventListener('click', (e) => {
        if (e.target === modalZoom) modalZoom.classList.remove('active');
      });
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

    // Favorites Modal
    const modalFavorites = document.getElementById('modalFavorites');
    const closeFavorites = document.getElementById('closeModalFavorites');
    if (closeFavorites && modalFavorites) {
      closeFavorites.addEventListener('click', () => modalFavorites.classList.remove('active'));
      modalFavorites.addEventListener('click', (e) => {
        if (e.target === modalFavorites) modalFavorites.classList.remove('active');
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
      // Shift + R to reset votes
      if (e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        this.confirmResetVotes();
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
    const leaderboardView = document.getElementById('leaderboardView');

    if (swiperStage) swiperStage.style.display = 'none';
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
    const leaderboardView = document.getElementById('leaderboardView');

    if (leaderboardView) leaderboardView.style.display = 'none';
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

  /**
   * Renders the Top 3 Featured Cards in the staggered fan layout:
   * Left: Rank #2 (Rotated -20deg, middle vertical height)
   * Center: Rank #1 (Rotated 2deg, HIGHEST vertical height)
   * Right: Rank #3 (Rotated 23deg, LOWEST vertical height)
   */
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
      const card2El = this.createFanCardElement(rank2, 2, 'fan-rank-2', '★ #2 MJESTO');
      fanContainer.appendChild(card2El);
    }

    // Card 1 (Center): 2deg, HIGHEST height
    if (rank1) {
      const card1El = this.createFanCardElement(rank1, 1, 'fan-rank-1', '👑 #1 FAVORIT');
      fanContainer.appendChild(card1El);
    }

    // Card 3 (Right): 23deg, LOWEST height
    if (rank3) {
      const card3El = this.createFanCardElement(rank3, 3, 'fan-rank-3', '★ #3 MJESTO');
      fanContainer.appendChild(card3El);
    }
  }

  createFanCardElement(item, rankNum, modifierClass, badgeText) {
    const card = document.createElement('div');
    card.className = `fan-card ${modifierClass}`;
    card.title = `Klikni za puni 2K prikaz: ${item.title}`;

    const optSrc = this.resolveImageUrl(item);
    const scoreVal = item.score !== undefined ? item.score : (item.likes || 0);
    const scoreText = scoreVal + ' PTS';
    const approvalText = (item.approvalRate !== undefined ? item.approvalRate : 100) + '% Sviđanja';

    card.innerHTML = `
      <span class="fan-badge">${badgeText}</span>
      <div class="fan-img-wrap">
        <img src="${optSrc}" class="fan-img" alt="${item.title}" loading="lazy">
      </div>
      <div class="fan-title">${item.title}</div>
      <div class="fan-score">
        <span>${scoreText}</span>
        <small>${approvalText}</small>
      </div>
    `;

    card.addEventListener('click', () => {
      this.openHighResViewer(item);
    });

    return card;
  }

  /**
   * Renders the Leaderboard ranking list with BIGGER thumbnails (88px)
   */
  async refreshLeaderboard() {
    const stats = await this.analytics.fetchGlobalStats();
    const listEl = document.getElementById('leaderboardList');
    const totalVotesLabel = document.getElementById('leaderboardTotalVotesLabel');
    if (!listEl) return;

    let items = stats.topRanked || [];

    if (totalVotesLabel) {
      totalVotesLabel.textContent = `GLASOVA: ${(stats.totalVotes || items.length).toLocaleString()}`;
    }

    listEl.innerHTML = '';

    if (!items.length) {
      listEl.innerHTML = `
        <div style="text-align:center; padding: 28px 16px; color: var(--text-muted); background: #0B0E0D; border: 1px dashed #1E2721; border-radius: 14px;">
          <div style="font-size: 1.6rem; margin-bottom: 6px;">⚔️</div>
          <p style="font-weight: 700; color: var(--gold-rich); margin-bottom: 4px;">GLASANJE JE UPRAVO OTVORENO</p>
          <p style="font-size: 0.85rem;">Glasaj za motive u špilu za ulazak na rang listu!</p>
        </div>
      `;
      return;
    }

    const maxScore = items[0] ? (items[0].score || 1) : 1;

    items.forEach((it, idx) => {
      const optSrc = this.resolveImageUrl(it);
      const fillPct = Math.max(8, Math.round(((it.score || 0) / maxScore) * 100));
      const rankRow = document.createElement('div');
      rankRow.className = `rank-item rank-${idx + 1}`;
      rankRow.title = `Klikni za puni 2K prikaz: ${it.title}`;

      rankRow.innerHTML = `
        <div class="rank-number">#${idx + 1}</div>
        <img src="${optSrc}" class="rank-thumb" alt="${it.title}" loading="lazy">
        <div class="rank-info">
          <div class="rank-title">${it.title}</div>
          <div class="rank-bar-wrapper">
            <div class="rank-bar-fill" style="width: ${fillPct}%;"></div>
          </div>
        </div>
        <div class="rank-score">
          ${(it.score || 0).toLocaleString()} PTS
          <small>${it.approvalRate || 100}% SVIĐANJA</small>
        </div>
      `;

      rankRow.addEventListener('click', () => {
        this.openHighResViewer(it);
      });

      listEl.appendChild(rankRow);
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

  openHighResViewer(itemOrSrc) {
    const modalZoom = document.getElementById('modalZoom');
    const zoomImg = document.getElementById('zoomImage');
    if (zoomImg && modalZoom) {
      zoomImg.src = this.resolveImageUrl(itemOrSrc);
      modalZoom.classList.add('active');
    }
  }

  openFavoritesModal() {
    const modalFavorites = document.getElementById('modalFavorites');
    const favGrid = document.getElementById('favoritesGrid');
    if (!modalFavorites || !favGrid) return;

    const favorites = this.analytics.getUserFavorites();
    favGrid.innerHTML = '';

    if (!favorites.length) {
      favGrid.innerHTML = `
        <div style="text-align:center; grid-column: 1 / -1; padding: 24px; color: var(--text-muted);">
          <p style="font-weight:700; color:var(--gold-rich);">JOŠ NISI ODABRAO FAVORITE</p>
          <p style="font-size:0.85rem; margin-top:4px;">Swipeaj udesno (Like) ili gore (Superlike) za dodavanje.</p>
        </div>
      `;
    } else {
      favorites.forEach(fav => {
        const optSrc = this.resolveImageUrl(fav);
        const card = document.createElement('div');
        card.className = 'podium-card';
        card.style.position = 'relative';
        card.innerHTML = `
          ${fav.isSuperlike ? '<span style="position:absolute; top:6px; right:6px; color:#F6CF65; font-size:0.85rem;">★</span>' : ''}
          <img src="${optSrc}" class="podium-img" alt="${fav.title}">
          <p class="podium-name">${fav.title}</p>
        `;
        card.addEventListener('click', () => this.openHighResViewer(fav));
        favGrid.appendChild(card);
      });
    }

    modalFavorites.classList.add('active');
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
    let toast = document.getElementById('appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: #141B17;
        color: #F6CF65;
        border: 1px solid #D0A041;
        padding: 10px 20px;
        border-radius: 12px;
        font-weight: 700;
        font-size: 0.88rem;
        box-shadow: 0 10px 25px rgba(0,0,0,0.8);
        z-index: 10000;
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
        opacity: 0;
        pointer-events: none;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(100px)';
    }, 2800);
  }
}

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.swiperApp = new SwiperApp();
});
