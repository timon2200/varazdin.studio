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
    this.catalog = CATALOG_DATA;
    this.noiseGrain = null;
    this.audioHaptics = null;
    this.analytics = null;
    this.cardEngine = null;
    this.shareCardGen = null;
    this.activeCategory = 'ALL';
    this.currentItem = null;

    this.init();
  }

  async init() {
    // 1. Initialize Subsystems
    this.noiseGrain = new NoiseGrain({ opacity: 0.08, density: 0.65 });
    this.audioHaptics = new AudioHaptics();
    this.analytics = new AnalyticsEngine(this.catalog);
    this.shareCardGen = new ShareCardGenerator();

    // Check URL parameters for reset or category
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

    // 3. Bind UI Events
    this.bindControls();
    this.bindCategoryTabs();
    this.bindModals();
    this.bindAudioToggle();
    this.bindKeyboardShortcuts();

    // 4. Live Analytics & Ticker Setup
    this.analytics.onTicker((feedItem) => this.updateTicker(feedItem));
    this.refreshLeaderboard();
    setInterval(() => this.refreshLeaderboard(), 8000); // Polling update

    // 5. Update initial counter from 0
    this.updateHeaderCounter();
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

    // Viral Share & Ranking Action Buttons
    const btnShareViral = document.getElementById('btnShareViral');
    const btnExportStory = document.getElementById('btnExportStory');
    const btnFavorites = document.getElementById('btnFavorites');
    const btnResetVotes = document.getElementById('btnResetVotes');

    if (btnShareViral) btnShareViral.addEventListener('click', () => this.openShareModal());
    if (btnExportStory) btnExportStory.addEventListener('click', () => this.exportTop3Story());
    if (btnFavorites) btnFavorites.addEventListener('click', () => this.openFavoritesModal());
    if (btnResetVotes) btnResetVotes.addEventListener('click', () => this.confirmResetVotes());

    // Mobile Drawer Toggle Button
    const btnToggleMobileLeaderboard = document.getElementById('btnToggleMobileLeaderboard');
    if (btnToggleMobileLeaderboard) {
      btnToggleMobileLeaderboard.addEventListener('click', () => {
        const panel = document.querySelector('.analytics-panel');
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  }

  bindCategoryTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const category = tab.dataset.category || 'ALL';
        this.activeCategory = category;
        this.cardEngine.setDeck(this.catalog, category);
        this.refreshLeaderboard();
        if (this.audioHaptics) this.audioHaptics.playTap();
      });
    });
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
        if (this.currentItem) this.openHighResViewer(this.currentItem.image.includes('assets/optimized/') ? this.currentItem.image : this.currentItem.image.replace('assets/designs/', 'assets/optimized/').replace(/\.(png|jpg)$/, '.webp'));
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

    // Podium / Summary Modal
    const modalPodium = document.getElementById('modalPodium');
    const closePodium = document.getElementById('closeModalPodium');
    const btnRestartDeck = document.getElementById('btnRestartDeck');
    if (closePodium && modalPodium) {
      closePodium.addEventListener('click', () => modalPodium.classList.remove('active'));
    }
    if (btnRestartDeck) {
      btnRestartDeck.addEventListener('click', () => {
        if (modalPodium) modalPodium.classList.remove('active');
        this.cardEngine.shuffle();
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
    this.refreshLeaderboard();
  }

  async handleDeckEmpty() {
    const modalPodium = document.getElementById('modalPodium');
    if (!modalPodium) return;

    const favorites = this.analytics.getUserFavorites();
    const podiumGrid = document.getElementById('podiumGrid');

    if (podiumGrid) {
      podiumGrid.innerHTML = '';
      const top3 = favorites.slice(0, 3);

      for (let i = 0; i < 3; i++) {
        const fav = top3[i];
        const cardEl = document.createElement('div');
        cardEl.className = `podium-card ${i === 0 ? 'podium-first' : ''}`;

        if (fav) {
          const optSrc = fav.image.includes('assets/optimized/') ? fav.image : fav.image.replace('assets/designs/', 'assets/optimized/').replace(/\.(png|jpg)$/, '.webp');
          cardEl.innerHTML = `
            <span class="podium-place">${i === 0 ? '★ 1. MJESTO' : `${i + 1}. MJESTO`}</span>
            <img src="${encodeURI(optSrc)}" class="podium-img" alt="${fav.title}">
            <p class="podium-name">${fav.title}</p>
          `;
        } else {
          cardEl.innerHTML = `
            <span class="podium-place">${i + 1}. MJESTO</span>
            <div style="height:80px;display:flex;align-items:center;justify-content:center;color:#4B5951;">—</div>
            <p class="podium-name">—</p>
          `;
        }
        podiumGrid.appendChild(cardEl);
      }
    }

    modalPodium.classList.add('active');
  }

  async refreshLeaderboard() {
    const stats = await this.analytics.fetchGlobalStats();
    const listEl = document.getElementById('leaderboardList');
    if (!listEl) return;

    let items = stats.topRanked || [];
    
    // Filter by active category if selected
    if (this.activeCategory !== 'ALL') {
      items = items.filter(it => it.category.toUpperCase() === this.activeCategory.toUpperCase());
    }

    listEl.innerHTML = '';

    if (!items.length) {
      listEl.innerHTML = `
        <div style="text-align:center; padding: 28px 16px; color: var(--text-muted); background: #0B0E0D; border: 1px dashed #1E2721; border-radius: 12px;">
          <div style="font-size: 1.5rem; margin-bottom: 6px;">⚔️</div>
          <p style="font-weight: 700; color: var(--gold-rich); margin-bottom: 4px;">GLASANJE JE UPRAVO OTVORENO</p>
          <p style="font-size: 0.8rem;">Povuci prvu majicu desno (Like) ili gore (Superlike) za ulazak na rang listu!</p>
        </div>
      `;
      return;
    }

    const topItems = items.slice(0, 10);
    const maxScore = topItems[0] ? topItems[0].score || 1 : 1;

    topItems.forEach((it, idx) => {
      const optSrc = it.image ? (it.image.includes('assets/optimized/') ? it.image : it.image.replace('assets/designs/', 'assets/optimized/').replace(/\.(png|jpg)$/, '.webp')) : '';
      const fillPct = Math.max(8, Math.round((it.score / maxScore) * 100));
      const rankRow = document.createElement('div');
      rankRow.className = `rank-item rank-${idx + 1}`;
      rankRow.innerHTML = `
        <div class="rank-number">#${idx + 1}</div>
        <img src="${encodeURI(optSrc)}" class="rank-thumb" alt="${it.title}" loading="lazy">
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
      listEl.appendChild(rankRow);
    });

    // Update Recent Activity Ticker
    if (stats.recentActivity && stats.recentActivity[0]) {
      this.updateTicker(stats.recentActivity[0]);
    }
  }

  updateTicker(feedItem) {
    const tickerContent = document.getElementById('tickerContent');
    if (!tickerContent) return;

    tickerContent.style.opacity = '0';
    setTimeout(() => {
      tickerContent.innerHTML = `<strong>${feedItem.user}</strong> ${feedItem.action} <span style="color:#D0A041;">${feedItem.item}</span> <span style="opacity:0.6;font-size:0.7rem;">(${feedItem.time})</span>`;
      tickerContent.style.opacity = '1';
    }, 180);
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

    if (infoImg) infoImg.src = this.currentItem.image;
    if (infoTitle) infoTitle.textContent = this.currentItem.title;
    if (infoCat) infoCat.textContent = `${this.currentItem.category.toUpperCase()} SERIES`;
    if (infoDesc) infoDesc.textContent = this.currentItem.description;

    if (modalInfo) modalInfo.classList.add('active');
  }

  openHighResViewer(imgSrc) {
    const modalZoom = document.getElementById('modalZoom');
    const zoomImg = document.getElementById('zoomImage');
    if (zoomImg && modalZoom) {
      zoomImg.src = encodeURI(imgSrc);
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
        const optSrc = fav.image.includes('assets/optimized/') ? fav.image : fav.image.replace('assets/designs/', 'assets/optimized/').replace(/\.(png|jpg)$/, '.webp');
        const card = document.createElement('div');
        card.className = 'podium-card';
        card.style.position = 'relative';
        card.innerHTML = `
          ${fav.isSuperlike ? '<span style="position:absolute; top:6px; right:6px; color:#F6CF65; font-size:0.85rem;">★</span>' : ''}
          <img src="${encodeURI(optSrc)}" class="podium-img" alt="${fav.title}">
          <p class="podium-name">${fav.title}</p>
        `;
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
      this.cardEngine.setDeck(this.catalog, this.activeCategory);
      this.updateHeaderCounter();
      this.refreshLeaderboard();
      this.showToast('✓ Svi glasovi su uspješno resetirani na 0!');
    }
  }

  async exportTop3Story() {
    const favorites = this.analytics.getUserFavorites();
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
