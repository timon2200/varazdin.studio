/**
 * Studio Varaždin — Kustoski Panel & Galerija Kontroler (admin.js)
 * Upravlja vizualnom mrežom, selekcijom i atomskim ažuriranjem kataloga majica.
 */

import { CATALOG_DATA as ACTIVE_CATALOG } from "./catalog-data.js";
import { CATALOG_DATA as MASTER_CATALOG } from "./catalog-data.master.js";
import { NoiseGrain } from "./noise-grain.js";
import { LightboxZoomEngine } from "./lightbox-zoom.js";
import { globalCommentsManager } from "./comments-manager.js";
import { globalCommentTooltip } from "./comment-tooltip.js";
import { globalHoldGesture } from "./hold-gesture.js";
import { initAllBrutalistSelects } from "./custom-select.js";

export class CatalogCurator {
  constructor() {
    this.commentsManager = globalCommentsManager;
    this.commentTooltip = globalCommentTooltip;
    this.holdGesture = globalHoldGesture;
    this.masterCatalog = (Array.isArray(MASTER_CATALOG) && MASTER_CATALOG.length > 0) 
      ? [...MASTER_CATALOG] 
      : ((Array.isArray(ACTIVE_CATALOG) && ACTIVE_CATALOG.length > 0) ? [...ACTIVE_CATALOG] : []);
    
    // Initial active selection: start from local bundle or localStorage draft
    let initialSelected = new Set(this.masterCatalog.map(it => it.id));
    try {
      const rawStored = localStorage.getItem("sv_curated_active_ids");
      if (rawStored !== null) {
        const parsed = JSON.parse(rawStored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const masterIdSet = new Set(this.masterCatalog.map(it => it.id));
          const valid = parsed.filter(id => masterIdSet.has(id));
          if (valid.length > 0) {
            initialSelected = new Set(valid);
          }
        }
      }
    } catch (e) {}

    this.selectedIds = initialSelected;
    this.activeCategory = "ALL";
    this.searchQuery = "";
    this.sortOption = "score-desc"; // 'score-desc' | 'default' | 'likes-desc' | 'super-desc' | 'votes-desc' | 'approval-desc' | 'title-asc'
    this.voteFilter = "all";     // 'all' | 'voted' | 'top20' | 'unvoted'
    this.rankedItems = [];
    this.activeRound = 1;
    this.itemStatsMap = new Map();
    this.masterCatalog.forEach(it => {
      this.itemStatsMap.set(it.id, {
        id: it.id,
        title: it.title,
        category: it.category,
        image: it.image,
        likes: it.likes || 0,
        superlikes: it.superlikes || 0,
        passes: it.passes || 0,
        score: it.score !== undefined ? it.score : ((it.likes || 0) + ((it.superlikes || 0) * 3)),
        totalVotes: it.totalVotes !== undefined ? it.totalVotes : ((it.likes || 0) + (it.superlikes || 0) + (it.passes || 0)),
        approvalRate: it.approvalRate !== undefined ? it.approvalRate : 0
      });
    });
    this.activeLightboxList = [];
    this.lightboxCurrentIndex = 0;
    this.filteredItems = [];

    // DOM Elements
    this.gridEl = document.getElementById("galleryGrid");
    this.activeCountEl = document.getElementById("activeCount");
    this.totalCountEl = document.getElementById("totalCount");
    this.floatingActiveEl = document.getElementById("floatingActiveCount");
    this.floatingTotalEl = document.getElementById("floatingTotalCount");
    this.searchInput = document.getElementById("searchInput");
    this.searchClear = document.getElementById("searchClear");
    this.toastEl = document.getElementById("toast");
    this.roundBadgeEl = document.getElementById("adminRoundStatusText");

    this.init();
  }

  async init() {
    // 0. Initialize theme
    this.initTheme();

    // 1. Initialize film grain texture
    try {
      new NoiseGrain({ opacity: 0.05, fps: 24 });
    } catch (e) {}

    // 2. Bind UI event listeners
    this.bindEvents();

    // 2.1 Comments real-time sync
    this.commentsManager.fetchServerComments();
    window.addEventListener("sv-comments-updated", () => {
      this.render();
    });

    // 3. Render immediately from local bundle (0ms instant paint)
    this.render();

    // 4. Background sync with backend API (authoritative source)
    await this.syncWithBackend(false);

    // 5. Load round & leaderboard stats
    await this.loadRoundAndLeaderboard();
  }

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
    const icon = document.getElementById('adminThemeIcon');
    if (icon) {
      icon.textContent = this.currentTheme === 'dark' ? '🌙 Dark' : '☀️ Light';
    }
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
    this.showToast(nextTheme === 'dark' ? '🌙 Dark Mode uključen' : '☀️ Light Mode uključen');
  }

  async syncWithBackend(showToast = false) {
    try {
      const res = await fetch("api/curate.php?t=" + Date.now(), {
        cache: "no-store",
        headers: { "Pragma": "no-cache" }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success") {
          if (Array.isArray(data.master) && data.master.length > 0) {
            this.masterCatalog = data.master;
          }
          if (Array.isArray(data.activeIds) || Array.isArray(data.active)) {
            const rawActiveIds = Array.isArray(data.activeIds) 
              ? data.activeIds 
              : data.active.map(it => it.id);
            const masterIdSet = new Set(this.masterCatalog.map(it => it.id));
            let validActiveIds = rawActiveIds.filter(id => masterIdSet.has(id));
            if (validActiveIds.length === 0 && this.masterCatalog.length > 0) {
              validActiveIds = this.masterCatalog.map(it => it.id);
            }
            this.selectedIds = new Set(validActiveIds);
            try {
              localStorage.setItem("sv_curated_active_ids", JSON.stringify(Array.from(this.selectedIds)));
            } catch (e) {}
            this.render();
            if (showToast) {
              this.showToast(`✓ Sinkronizirano sa serverom: aktivno ${this.selectedIds.size} majica.`);
            }
          }
        }
      }
    } catch (e) {
      console.info("Offline or static host: using local catalog bundle.", e);
      if (showToast) {
        this.showToast("ℹ️ Server API nije dostupan. Koristi se lokalni špil.");
      }
    }
  }

  bindEvents() {
    // Category Nav
    document.querySelectorAll(".cat-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".cat-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this.activeCategory = pill.dataset.cat || "ALL";
        this.render();
      });
    });

    // Sort Select
    document.getElementById("adminSortSelect")?.addEventListener("change", (e) => {
      this.sortOption = e.target.value;
      this.render();
    });

    // Initialize custom brutalist styled dropdown selects
    initAllBrutalistSelects(document);

    // Vote Filter Group
    const voteGroup = document.getElementById("adminVoteFilterGroup");
    if (voteGroup) {
      voteGroup.addEventListener("click", (e) => {
        const btn = e.target.closest(".vote-pill");
        if (!btn) return;
        voteGroup.querySelectorAll(".vote-pill").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.voteFilter = btn.dataset.votefilter || "all";
        this.render();
      });
    }

    // Search Input
    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        if (this.searchClear) {
          this.searchClear.style.display = this.searchQuery ? "block" : "none";
        }
        this.render();
      });
    }

    if (this.searchClear) {
      this.searchClear.addEventListener("click", () => {
        this.searchInput.value = "";
        this.searchQuery = "";
        this.searchClear.style.display = "none";
        this.render();
      });
    }

    // Bulk Buttons & Finalist Selectors
    document.getElementById("btnTop20")?.addEventListener("click", () => this.selectTopFinalists(20));
    document.getElementById("btnTop30")?.addEventListener("click", () => this.selectTopFinalists(30));
    document.getElementById("btnTop50")?.addEventListener("click", () => this.selectTopFinalists(50));
    document.getElementById("btnSelectAll")?.addEventListener("click", () => this.selectAllFiltered(true));
    document.getElementById("btnDeselectAll")?.addEventListener("click", () => this.selectAllFiltered(false));
    document.getElementById("btnInvert")?.addEventListener("click", () => this.invertFiltered());
    document.getElementById("btnSmartDuplicates")?.addEventListener("click", () => this.cleanSmartDuplicates());
    document.getElementById("btnExportJson")?.addEventListener("click", () => this.exportSelectionJson());
    document.getElementById("btnImportJson")?.addEventListener("click", () => this.importSelectionJson());
    document.getElementById("btnSyncServer")?.addEventListener("click", () => this.syncWithBackend(true));

    // Modals: Leaderboard & Advance Round
    document.getElementById("btnLeaderboardModal")?.addEventListener("click", () => this.openLeaderboardModal());
    document.getElementById("closeModalLeaderboard")?.addEventListener("click", () => this.closeLeaderboardModal());
    document.getElementById("modalLeaderboard")?.addEventListener("click", (e) => {
      if (e.target.id === "modalLeaderboard") this.closeLeaderboardModal();
    });

    document.getElementById("btnExportCsv")?.addEventListener("click", () => {
      window.open("api/export.php?round=1&format=csv", "_blank");
    });

    document.getElementById("btnAdvanceRoundModal")?.addEventListener("click", () => this.openAdvanceModal());
    document.getElementById("closeModalAdvance")?.addEventListener("click", () => this.closeAdvanceModal());
    document.getElementById("btnCancelAdvance")?.addEventListener("click", () => this.closeAdvanceModal());
    document.getElementById("btnConfirmAdvance")?.addEventListener("click", () => this.confirmAdvanceRound());
    document.getElementById("modalAdvanceRound")?.addEventListener("click", (e) => {
      if (e.target.id === "modalAdvanceRound") this.closeAdvanceModal();
    });

    // Theme Toggle
    document.getElementById("btnThemeToggleAdmin")?.addEventListener("click", () => this.toggleTheme());

    // Save Buttons
    document.getElementById("btnSave")?.addEventListener("click", () => this.saveCuratedCatalog());
    document.getElementById("btnSaveFloating")?.addEventListener("click", () => this.saveCuratedCatalog());

    // Modal Zoom Lightbox Listeners & Arrow Navigation
    const zoomModal = document.getElementById("modalZoom");
    const zoomImgContainer = document.querySelector("#modalZoom .lightbox-img-container");
    const zoomImg = document.getElementById("zoomImage");
    const zoomLevelTag = document.getElementById("zoomLevelTag");

    if (zoomImgContainer && zoomImg) {
      this.lightboxZoom = new LightboxZoomEngine({
        container: zoomImgContainer,
        image: zoomImg,
        levelBadge: zoomLevelTag,
        minScale: 1.0,
        maxScale: 4.5,
        cropScale: 2.5
      });

      document.getElementById("btnZoomIn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.lightboxZoom?.zoomIn();
      });
      document.getElementById("btnZoomOut")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.lightboxZoom?.zoomOut();
      });
      document.getElementById("btnZoomReset")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.lightboxZoom?.reset();
      });
    }

    document.getElementById("closeModalZoom")?.addEventListener("click", () => this.closeZoomModal());
    document.getElementById("btnAdminLightboxPrev")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.prevZoomItem();
    });
    document.getElementById("btnAdminLightboxNext")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.nextZoomItem();
    });

    document.getElementById("modalZoom")?.addEventListener("click", (e) => {
      if (e.target.id === "modalZoom") {
        this.closeZoomModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      const zoomModal = document.getElementById("modalZoom");
      const isZoomOpen = zoomModal && (zoomModal.classList.contains("show") || zoomModal.style.display === "flex");

      if (isZoomOpen) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          this.prevZoomItem();
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          this.nextZoomItem();
          return;
        }
      }

      if (e.key === "Escape") {
        this.closeZoomModal();
        this.closeLeaderboardModal();
        this.closeAdvanceModal();
      }
    });
  }

  getFilteredItems() {
    let items = this.masterCatalog.map(item => {
      const st = this.itemStatsMap.get(item.id) || {};
      const likes = st.likes !== undefined ? st.likes : (item.likes || 0);
      const superlikes = st.superlikes !== undefined ? st.superlikes : (item.superlikes || 0);
      const passes = st.passes !== undefined ? st.passes : (item.passes || 0);
      const score = st.score !== undefined ? st.score : (likes + (superlikes * 3));
      const totalVotes = st.totalVotes !== undefined ? st.totalVotes : (likes + superlikes + passes);
      const approvalRate = st.approvalRate !== undefined ? st.approvalRate : (totalVotes > 0 ? Math.round(((likes + superlikes) / totalVotes) * 100) : 0);
      const bayesianMean = st.bayesianMean !== undefined ? st.bayesianMean : (item.bayesianMean || 0);

      return {
        ...item,
        _statLikes: likes,
        _statSuper: superlikes,
        _statPasses: passes,
        _statScore: score,
        _statTotalVotes: totalVotes,
        _statApproval: approvalRate,
        _statBayesian: bayesianMean
      };
    });

    let filtered = items.filter(item => {
      if (this.activeCategory === "Selected") {
        if (!this.selectedIds.has(item.id)) return false;
      } else if (this.activeCategory === "Comments") {
        if (!this.commentsManager || !this.commentsManager.hasComment(item.id)) return false;
      } else if (this.activeCategory !== "ALL") {
        if ((item.category || "").toUpperCase() !== this.activeCategory.toUpperCase()) {
          return false;
        }
      }

      // Vote Filter (all, voted, top20, commented, zeropts, unvoted)
      if (this.voteFilter === "voted") {
        if (item._statTotalVotes <= 0) return false;
      } else if (this.voteFilter === "unvoted") {
        if (item._statTotalVotes > 0) return false;
      } else if (this.voteFilter === "zeropts") {
        if ((item._statScore || 0) > 0) return false;
      } else if (this.voteFilter === "commented") {
        if (!this.commentsManager || !this.commentsManager.hasComment(item.id)) return false;
      }

      if (this.searchQuery) {
        const titleMatch = item.title.toLowerCase().includes(this.searchQuery);
        const catMatch = item.category.toLowerCase().includes(this.searchQuery);
        const tagMatch = item.tags && item.tags.some(t => t.toLowerCase().includes(this.searchQuery));
        const commentMatch = this.commentsManager && (this.commentsManager.getCommentText(item.id) || '').toLowerCase().includes(this.searchQuery);
        if (!titleMatch && !catMatch && !tagMatch && !commentMatch) return false;
      }
      return true;
    });

    // Sorting
    if (this.sortOption === "score-desc" || this.voteFilter === "top20") {
      filtered.sort((a, b) => b._statScore - a._statScore || (b._statBayesian || 0) - (a._statBayesian || 0) || (b._statApproval || 0) - (a._statApproval || 0) || b._statTotalVotes - a._statTotalVotes);
    } else if (this.sortOption === "likes-desc") {
      filtered.sort((a, b) => b._statLikes - a._statLikes || b._statScore - a._statScore || (b._statBayesian || 0) - (a._statBayesian || 0));
    } else if (this.sortOption === "super-desc") {
      filtered.sort((a, b) => b._statSuper - a._statSuper || b._statScore - a._statScore || (b._statBayesian || 0) - (a._statBayesian || 0));
    } else if (this.sortOption === "votes-desc") {
      filtered.sort((a, b) => b._statTotalVotes - a._statTotalVotes || b._statScore - a._statScore);
    } else if (this.sortOption === "approval-desc") {
      filtered.sort((a, b) => b._statApproval - a._statApproval || b._statScore - a._statScore || (b._statBayesian || 0) - (a._statBayesian || 0));
    } else if (this.sortOption === "title-asc") {
      filtered.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }

    if (this.voteFilter === "top20") {
      filtered = filtered.slice(0, 20);
    }

    this.filteredItems = filtered;
    return filtered;
  }

  resolveImageUrl(item) {
    if (!item) return "";
    let raw = item.image || `assets/optimized/${item.title}.webp`;
    const opt = raw.includes("assets/optimized/") ? raw : raw.replace("assets/designs/", "assets/optimized/").replace(/\.(png|jpg)$/, ".webp");
    return encodeURI(opt);
  }

  render() {
    if (!this.gridEl) return;
    this.gridEl.innerHTML = "";

    const filtered = this.getFilteredItems();

    filtered.forEach((item, index) => {
      const isChecked = this.selectedIds.has(item.id);
      const card = document.createElement("article");
      card.className = `gallery-card ${isChecked ? "is-checked" : ""}`;
      card.dataset.id = item.id;
      card.setAttribute("role", "checkbox");
      card.setAttribute("aria-checked", isChecked ? "true" : "false");

      const imgSrc = this.resolveImageUrl(item);
      const scoreVal = item._statScore || 0;
      const likesVal = item._statLikes || 0;
      const superVal = item._statSuper || 0;
      const passVal = item._statPasses || 0;

      const commentObj = this.commentsManager ? this.commentsManager.getComment(item.id) : null;
      const hasComment = !!(commentObj && commentObj.text && commentObj.text.trim().length > 0);

      card.innerHTML = `
        <div class="gallery-img-wrap" title="Klikni za odabir ili drži za bilješku">
          <img src="${imgSrc}" class="gallery-img" alt="${item.title}" loading="${index < 12 ? 'eager' : 'lazy'}">
          <span class="card-category-tag">${item.category.toUpperCase()}</span>
          
          <div class="check-badge" title="${isChecked ? 'Označeno za swiper' : 'Nije označeno'}">
            <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>

          <div class="card-corner-actions">
            <button class="card-comment-btn ${hasComment ? 'has-comment' : ''}" type="button" title="${hasComment ? 'Uredi bilješku' : 'Dodaj bilješku'}" data-action="comment">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
            <button class="card-zoom-btn" type="button" title="Povećaj motiv u punoj rezoluciji" data-action="zoom">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>
          </div>
        </div>

        <div class="card-footer-info">
          <div class="card-title-text" title="${item.title}">${item.title}</div>
          
          <div class="card-stats-line">
            <span class="card-points-pill">★ ${scoreVal} PTS</span>
            <div class="card-votes-stats">
              <span class="stat-val-likes" title="Lajkovi">♥ ${likesVal}</span>
              <span class="stat-val-super" title="Superlike">★ ${superVal}</span>
              <span class="stat-val-pass" title="Preskočeno">✕ ${passVal}</span>
            </div>
          </div>

          ${hasComment ? `
            <div class="card-comment-callout" title="Klikni za uređivanje bilješke" data-action="comment">
              <span class="comment-callout-icon">💬</span>
              <span class="comment-callout-text">"${commentObj.text}"</span>
            </div>
          ` : ''}

          <div class="card-meta-bottom">
            <span class="card-id-tag">#${item.id}</span>
            <span class="card-status-label">${isChecked ? 'AKTIVNO' : 'NEAKTIVNO'}</span>
          </div>
        </div>
      `;

      card.addEventListener("click", (e) => {
        const zoomBtn = e.target.closest('[data-action="zoom"]');
        if (zoomBtn) {
          e.stopPropagation();
          this.openZoomModal(item, filtered);
          return;
        }

        const commentBtn = e.target.closest('[data-action="comment"]');
        if (commentBtn) {
          e.stopPropagation();
          this.commentTooltip.open(item, { x: e.clientX, y: e.clientY });
          return;
        }

        this.toggleItem(item.id, card);
      });

      // Attach Long-Press hold gesture to admin gallery card
      if (this.holdGesture) {
        this.holdGesture.attach(card, {
          getItem: () => item,
          onTrigger: ({ x, y }) => {
            this.commentTooltip.open(item, { x, y });
          }
        });
      }

      this.gridEl.appendChild(card);
    });

    this.updateCounters();
  }

  toggleItem(id, cardEl) {
    const statusLabel = cardEl.querySelector(".card-status-label");
    const checkBadge = cardEl.querySelector(".check-badge");
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      cardEl.classList.remove("is-checked");
      cardEl.setAttribute("aria-checked", "false");
      if (statusLabel) statusLabel.textContent = "NEAKTIVNO";
      if (checkBadge) checkBadge.setAttribute("title", "Nije označeno");
    } else {
      this.selectedIds.add(id);
      cardEl.classList.add("is-checked");
      cardEl.setAttribute("aria-checked", "true");
      if (statusLabel) statusLabel.textContent = "AKTIVNO";
      if (checkBadge) checkBadge.setAttribute("title", "Označeno za swiper");
    }
    try {
      localStorage.setItem("sv_curated_active_ids", JSON.stringify(Array.from(this.selectedIds)));
    } catch (e) {}
    this.updateCounters();
  }

  /* ==========================================================================
     ADMIN LIGHTBOX GALLERY NAVIGATION
     ========================================================================== */
  openZoomModal(item, currentList = null) {
    this.activeLightboxList = (Array.isArray(currentList) && currentList.length > 0) 
      ? currentList 
      : (this.filteredItems.length > 0 ? this.filteredItems : this.masterCatalog);

    let targetIdx = this.activeLightboxList.findIndex(it => it.id === item.id);
    if (targetIdx === -1) targetIdx = 0;

    this.lightboxCurrentIndex = targetIdx;
    this.renderZoomItem();

    const modal = document.getElementById("modalZoom");
    if (!modal) return;
    modal.style.display = "flex";
    requestAnimationFrame(() => {
      modal.classList.add("show");
    });
    document.body.style.overflow = "hidden";
  }

  renderZoomItem() {
    const modal = document.getElementById("modalZoom");
    const img = document.getElementById("zoomImage");
    const title = document.getElementById("zoomTitle");
    const cat = document.getElementById("zoomCategory");
    const idEl = document.getElementById("zoomId");
    const pointsEl = document.getElementById("zoomPoints");
    const counterEl = document.getElementById("zoomCounter");

    if (!modal || !img) return;

    const currentItem = this.activeLightboxList[this.lightboxCurrentIndex] || this.masterCatalog[0];
    if (!currentItem) return;

    if (this.lightboxZoom) {
      this.lightboxZoom.reset(false);
    }

    img.src = this.resolveImageUrl(currentItem);
    if (title) title.textContent = currentItem.title || 'Motiv';
    if (cat) cat.textContent = (currentItem.category || 'ARTWEAR').toUpperCase();
    if (idEl) idEl.textContent = `#${currentItem.id}`;

    const scoreVal = currentItem._statScore !== undefined ? currentItem._statScore : 0;
    if (pointsEl) {
      pointsEl.textContent = `★ ${scoreVal} PTS`;
      pointsEl.style.display = "inline-block";
    }

    if (counterEl) {
      counterEl.textContent = `${this.lightboxCurrentIndex + 1} / ${this.activeLightboxList.length}`;
    }

    // Preload next and prev
    if (this.activeLightboxList.length > 1) {
      const nextIdx = (this.lightboxCurrentIndex + 1) % this.activeLightboxList.length;
      const prevIdx = (this.lightboxCurrentIndex - 1 + this.activeLightboxList.length) % this.activeLightboxList.length;
      const preloadNext = new Image();
      preloadNext.src = this.resolveImageUrl(this.activeLightboxList[nextIdx]);
      const preloadPrev = new Image();
      preloadPrev.src = this.resolveImageUrl(this.activeLightboxList[prevIdx]);
    }
  }

  nextZoomItem() {
    if (!this.activeLightboxList.length) return;
    this.lightboxCurrentIndex = (this.lightboxCurrentIndex + 1) % this.activeLightboxList.length;
    this.renderZoomItem();
  }

  prevZoomItem() {
    if (!this.activeLightboxList.length) return;
    this.lightboxCurrentIndex = (this.lightboxCurrentIndex - 1 + this.activeLightboxList.length) % this.activeLightboxList.length;
    this.renderZoomItem();
  }

  closeZoomModal() {
    const modal = document.getElementById("modalZoom");
    if (!modal) return;
    modal.classList.remove("show");
    if (this.lightboxZoom) {
      this.lightboxZoom.reset(false);
    }
    setTimeout(() => {
      if (!modal.classList.contains("show")) {
        modal.style.display = "none";
      }
    }, 200);
    document.body.style.overflow = "";
  }

  selectAllFiltered(select = true) {
    const filtered = this.getFilteredItems();
    filtered.forEach(it => {
      if (select) this.selectedIds.add(it.id);
      else this.selectedIds.delete(it.id);
    });
    try {
      localStorage.setItem("sv_curated_active_ids", JSON.stringify(Array.from(this.selectedIds)));
    } catch (e) {}
    this.render();
  }

  invertFiltered() {
    const filtered = this.getFilteredItems();
    filtered.forEach(it => {
      if (this.selectedIds.has(it.id)) this.selectedIds.delete(it.id);
      else this.selectedIds.add(it.id);
    });
    try {
      localStorage.setItem("sv_curated_active_ids", JSON.stringify(Array.from(this.selectedIds)));
    } catch (e) {}
    this.render();
  }

  cleanSmartDuplicates() {
    const seenBase = new Map();
    let cleanedCount = 0;

    this.masterCatalog.forEach(item => {
      const baseName = item.title
        .replace(/\b(Black on White|White on Black|Studio Black|Studio Sunburst|Flare|Sunburst|White|Black|Cream)\b/gi, "")
        .replace(/[-_\s]+/g, " ")
        .trim().toLowerCase();

      if (seenBase.has(baseName)) {
        this.selectedIds.delete(item.id);
        cleanedCount++;
      } else {
        seenBase.set(baseName, item.id);
        this.selectedIds.add(item.id);
      }
    });

    try {
      localStorage.setItem("sv_curated_active_ids", JSON.stringify(Array.from(this.selectedIds)));
    } catch (e) {}
    this.render();
    this.showToast(`⚡ Pametni filter: ${cleanedCount} varijanti/duplikata isključeno.`);
  }

  exportSelectionJson() {
    const ids = Array.from(this.selectedIds);
    const jsonStr = JSON.stringify(ids, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(jsonStr)
        .then(() => this.showToast(`📋 Kopirano ${ids.length} ID-eva u međuspremnik!`))
        .catch(() => this.promptExport(jsonStr, ids.length));
    } else {
      this.promptExport(jsonStr, ids.length);
    }
  }

  promptExport(jsonStr, count) {
    prompt(`Kopirajte JSON listu od ${count} odabranih ID-eva:`, jsonStr);
  }

  importSelectionJson() {
    const input = prompt("Zalijepite JSON listu ID-eva (npr. [\"sv-001\", \"sv-002\"]) :");
    if (!input) return;
    try {
      const parsed = JSON.parse(input.trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        this.selectedIds = new Set(parsed);
        try {
          localStorage.setItem("sv_curated_active_ids", JSON.stringify(parsed));
        } catch (e) {}
        this.render();
        this.showToast(`📥 Uvezeno ${this.selectedIds.size} majica! Kliknite 'SPREMI ODABIR' za trajno spremanje.`);
      } else {
        this.showToast("⚠️ Nevažeći format JSON niza.");
      }
    } catch (e) {
      this.showToast("⚠️ Greška u JSON sintaksi.");
    }
  }

  updateCounters() {
    const total = this.masterCatalog.length;
    const masterIdSet = new Set(this.masterCatalog.map(it => it.id));
    const validSelected = Array.from(this.selectedIds).filter(id => masterIdSet.has(id));
    const active = validSelected.length;

    if (this.activeCountEl) this.activeCountEl.textContent = active;
    if (this.totalCountEl) this.totalCountEl.textContent = total;
    if (this.floatingActiveEl) this.floatingActiveEl.textContent = active;
    if (this.floatingTotalEl) this.floatingTotalEl.textContent = total;

    const categoryTotals = {};
    this.masterCatalog.forEach(it => {
      const c = it.category;
      categoryTotals[c] = (categoryTotals[c] || 0) + 1;
    });

    const badgeAll = document.getElementById("badgeAll");
    if (badgeAll) badgeAll.textContent = total;

    const badgeSelected = document.getElementById("badgeSelected");
    if (badgeSelected) badgeSelected.textContent = active;

    const categories = ["City", "Studio", "Creative", "Garda", "Towers", "Utility", "Artwear", "Front Hits", "Experimental"];
    categories.forEach(cat => {
      const badgeId = "badge" + cat.replace(/\s+/g, "");
      const b = document.getElementById(badgeId);
      if (b) b.textContent = categoryTotals[cat] || 0;
    });

    const badgeComments = document.getElementById("badgeComments");
    if (badgeComments) {
      badgeComments.textContent = this.commentsManager ? this.commentsManager.getCommentCount() : 0;
    }
  }

  async saveCuratedCatalog() {
    const activeItems = this.masterCatalog.filter(it => this.selectedIds.has(it.id));
    const activeIdsArray = Array.from(this.selectedIds);
    
    // Always persist to localStorage first
    try {
      localStorage.setItem("sv_curated_active_ids", JSON.stringify(activeIdsArray));
    } catch (e) {}

    const payload = {
      activeIds: activeIdsArray,
      activeItems: activeItems
    };

    const btn = document.getElementById("btnSave");
    const btnFloat = document.getElementById("btnSaveFloating");
    const originalText = btn ? btn.innerHTML : "";
    if (btn) btn.innerHTML = "<span>SPREMANJE...</span>";
    if (btnFloat) btnFloat.innerHTML = "<span>SPREMANJE...</span>";

    try {
      const res = await fetch("api/curate.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        const count = result.activeCount !== undefined ? result.activeCount : activeItems.length;
        this.showToast(`✓ Spremljeno na server! Aktivno ${count} majica u Swiperu.`);
      } else {
        const errData = await res.json().catch(() => ({}));
        this.showToast(`⚠️ Server odgovor (${res.status}): ${errData.error || 'Nije uspjelo'}`);
      }
    } catch (err) {
      console.warn("Save API network warning:", err);
      this.showToast(`✓ Lokalno spremljeno (${activeItems.length} majica). Server API nedostupan.`);
    } finally {
      if (btn) btn.innerHTML = originalText;
      if (btnFloat) btnFloat.innerHTML = "<span>SPREMI ZA SWIPER</span>";
    }
  }

  async loadRoundAndLeaderboard() {
    try {
      // 1. Fetch Rounds Meta
      const roundsRes = await fetch("api/rounds.php?t=" + Date.now());
      if (roundsRes.ok) {
        const roundsData = await roundsRes.json();
        if (roundsData.status === "success") {
          this.activeRound = roundsData.activeRound || 1;
        }
      }
    } catch (e) {}

    try {
      // 2. Fetch Leaderboard for Round 1
      const statsRes = await fetch("api/stats.php?round=1&t=" + Date.now());
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        this.rankedItems = Array.isArray(statsData.topRanked) ? statsData.topRanked : [];
        const totalVotes = statsData.totalVotes || 2271;
        const totalVoters = statsData.uniqueVoters || 6;

        if (this.rankedItems.length > 0) {
          if (!this.masterCatalog || this.masterCatalog.length === 0) {
            this.masterCatalog = [...this.rankedItems];
          }
          this.rankedItems.forEach(it => {
            this.itemStatsMap.set(it.id, it);
          });
        }

        if (this.selectedIds.size === 0 && this.masterCatalog.length > 0) {
          this.selectedIds = new Set(this.masterCatalog.map(it => it.id));
        }

        if (this.roundBadgeEl) {
          this.roundBadgeEl.textContent = `${this.activeRound}. KOLO · ${totalVotes.toLocaleString('hr-HR')} GLASOVA`;
        }

        const leadVotes = document.getElementById("leadTotalVotes");
        const leadVoters = document.getElementById("leadTotalVoters");
        const leadItems = document.getElementById("leadTotalItems");
        if (leadVotes) leadVotes.textContent = totalVotes.toLocaleString('hr-HR');
        if (leadVoters) leadVoters.textContent = totalVoters;
        if (leadItems) leadItems.textContent = this.rankedItems.length || this.masterCatalog.length;

        this.renderLeaderboardTable();
        this.render();
      }
    } catch (e) {
      console.warn("Stats fetch warning:", e);
    }
  }

  selectTopFinalists(count) {
    if (!this.rankedItems || this.rankedItems.length === 0) {
      this.showToast("⚠️ Rang lista još nije učitana. Povlačim podatke...");
      this.loadRoundAndLeaderboard().then(() => this.selectTopFinalists(count));
      return;
    }

    const topItems = this.rankedItems.slice(0, count);
    const topIds = new Set(topItems.map(it => it.id));

    this.selectedIds = topIds;
    try {
      localStorage.setItem("sv_curated_active_ids", JSON.stringify(Array.from(this.selectedIds)));
    } catch (e) {}

    // Switch category filter to ALL so they can see all selected items
    document.querySelectorAll(".cat-pill").forEach(p => p.classList.remove("active"));
    const allPill = document.querySelector('.cat-pill[data-cat="ALL"]');
    if (allPill) allPill.classList.add("active");
    this.activeCategory = "ALL";

    this.render();
    this.showToast(`🏆 Označeno Top ${this.selectedIds.size} finalista! Kliknite 'SPREMI ODABIR' ili 'POKRENI 2. KOLO'.`);
  }

  renderLeaderboardTable() {
    const tbody = document.getElementById("leaderboardTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    this.rankedItems.forEach((it, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="rank-badge-cell">#${idx + 1}</td>
        <td><code>${it.id || ''}</code></td>
        <td style="font-weight:700; color:var(--text-primary);">${it.title || ''}</td>
        <td><span class="card-category-tag" style="position:static; font-size:0.65rem;">${(it.category || '').toUpperCase()}</span></td>
        <td><strong style="color:var(--accent-green-bright);">${it.score || 0}</strong></td>
        <td style="color:var(--accent-gold-bright);">★ ${it.superlikes || 0}</td>
        <td style="color:var(--accent-red-bright);">❤️ ${it.likes || 0}</td>
        <td style="color:var(--text-muted);">✕ ${it.passes || 0}</td>
        <td><strong>${it.approvalRate || 0}%</strong></td>
      `;
      tbody.appendChild(tr);
    });
  }

  openLeaderboardModal() {
    const modal = document.getElementById("modalLeaderboard");
    if (!modal) return;
    if (!this.rankedItems || this.rankedItems.length === 0) {
      this.loadRoundAndLeaderboard();
    }
    modal.style.display = "flex";
    requestAnimationFrame(() => modal.classList.add("show"));
    document.body.style.overflow = "hidden";
  }

  closeLeaderboardModal() {
    const modal = document.getElementById("modalLeaderboard");
    if (!modal) return;
    modal.classList.remove("show");
    setTimeout(() => {
      if (!modal.classList.contains("show")) modal.style.display = "none";
    }, 200);
    document.body.style.overflow = "";
  }

  openAdvanceModal() {
    const modal = document.getElementById("modalAdvanceRound");
    const countEl = document.getElementById("advanceFinalistCount");
    if (!modal) return;
    if (countEl) countEl.textContent = this.selectedIds.size;

    if (this.selectedIds.size === 0) {
      this.showToast("⚠️ Prvo označite barem nekoliko finalista (npr. kliknite '🏆 Top 30').");
      return;
    }

    modal.style.display = "flex";
    requestAnimationFrame(() => modal.classList.add("show"));
    document.body.style.overflow = "hidden";
  }

  closeAdvanceModal() {
    const modal = document.getElementById("modalAdvanceRound");
    if (!modal) return;
    modal.classList.remove("show");
    setTimeout(() => {
      if (!modal.classList.contains("show")) modal.style.display = "none";
    }, 200);
    document.body.style.overflow = "";
  }

  async confirmAdvanceRound() {
    const btn = document.getElementById("btnConfirmAdvance");
    const originalText = btn ? btn.innerHTML : "";
    if (btn) btn.innerHTML = "<span>POKRETANJE...</span>";

    const payload = {
      action: "start_next_round",
      finalistIds: Array.from(this.selectedIds),
      name: "2. Kolo — Finale & Finalisti"
    };

    try {
      const res = await fetch("api/rounds.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        this.closeAdvanceModal();
        this.showToast(`🏁 ${result.message || '2. Kolo je uspješno pokrenuto!'}`);
        await this.syncWithBackend(false);
        await this.loadRoundAndLeaderboard();
      } else {
        const err = await res.json().catch(() => ({}));
        this.showToast(`⚠️ Greška: ${err.error || 'Pokretanje nije uspjelo'}`);
      }
    } catch (e) {
      console.error(e);
      this.showToast("⚠️ Problem s mrežom pri komunikaciji s API-jem.");
    } finally {
      if (btn) btn.innerHTML = originalText;
    }
  }

  showToast(message) {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.add("active");
    setTimeout(() => {
      this.toastEl.classList.remove("active");
    }, 3500);
  }
}

// Robust Bootstrap (handles both pre- and post-DOMContentLoaded module execution)
function initCurator() {
  if (!window.catalogCurator) {
    window.catalogCurator = new CatalogCurator();
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCurator);
  } else {
    initCurator();
  }
}
