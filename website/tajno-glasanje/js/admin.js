/**
 * Studio Varaždin — Kustoski Panel & Galerija Kontroler (admin.js)
 * Upravlja vizualnom mrežom, selekcijom i atomskim ažuriranjem kataloga majica.
 */

import { CATALOG_DATA as ACTIVE_CATALOG } from "./catalog-data.js";
import { CATALOG_DATA as MASTER_CATALOG } from "./catalog-data.master.js";
import { NoiseGrain } from "./noise-grain.js";

export class CatalogCurator {
  constructor() {
    this.masterCatalog = (Array.isArray(MASTER_CATALOG) && MASTER_CATALOG.length > 0) 
      ? [...MASTER_CATALOG] 
      : [...ACTIVE_CATALOG];
    
    // Initial active selection: start from local bundle or localStorage draft
    let initialSelected = new Set(ACTIVE_CATALOG.map(it => it.id));
    try {
      const rawStored = localStorage.getItem("sv_curated_active_ids");
      if (rawStored) {
        const parsed = JSON.parse(rawStored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          initialSelected = new Set(parsed);
        }
      }
    } catch (e) {}

    this.selectedIds = initialSelected;
    this.activeCategory = "ALL";
    this.searchQuery = "";

    // DOM Elements
    this.gridEl = document.getElementById("galleryGrid");
    this.activeCountEl = document.getElementById("activeCount");
    this.totalCountEl = document.getElementById("totalCount");
    this.floatingActiveEl = document.getElementById("floatingActiveCount");
    this.floatingTotalEl = document.getElementById("floatingTotalCount");
    this.searchInput = document.getElementById("searchInput");
    this.searchClear = document.getElementById("searchClear");
    this.toastEl = document.getElementById("toast");

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

    // 3. Render immediately from local bundle (0ms instant paint)
    this.render();

    // 4. Background sync with backend API (authoritative source)
    await this.syncWithBackend(false);
  }

  initTheme() {
    let savedTheme = 'light';
    try {
      savedTheme = localStorage.getItem('sv_theme') || 'light';
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
          if (Array.isArray(data.active) && data.active.length > 0) {
            this.selectedIds = new Set(data.active.map(it => it.id));
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

    // Bulk Buttons
    document.getElementById("btnSelectAll")?.addEventListener("click", () => this.selectAllFiltered(true));
    document.getElementById("btnDeselectAll")?.addEventListener("click", () => this.selectAllFiltered(false));
    document.getElementById("btnInvert")?.addEventListener("click", () => this.invertFiltered());
    document.getElementById("btnSmartDuplicates")?.addEventListener("click", () => this.cleanSmartDuplicates());
    document.getElementById("btnExportJson")?.addEventListener("click", () => this.exportSelectionJson());
    document.getElementById("btnImportJson")?.addEventListener("click", () => this.importSelectionJson());
    document.getElementById("btnSyncServer")?.addEventListener("click", () => this.syncWithBackend(true));

    // Theme Toggle
    document.getElementById("btnThemeToggleAdmin")?.addEventListener("click", () => this.toggleTheme());

    // Save Buttons
    document.getElementById("btnSave")?.addEventListener("click", () => this.saveCuratedCatalog());
    document.getElementById("btnSaveFloating")?.addEventListener("click", () => this.saveCuratedCatalog());
  }

  getFilteredItems() {
    return this.masterCatalog.filter(item => {
      if (this.activeCategory !== "ALL") {
        if (item.category.toUpperCase() !== this.activeCategory.toUpperCase()) {
          return false;
        }
      }
      if (this.searchQuery) {
        const titleMatch = item.title.toLowerCase().includes(this.searchQuery);
        const catMatch = item.category.toLowerCase().includes(this.searchQuery);
        const tagMatch = item.tags && item.tags.some(t => t.toLowerCase().includes(this.searchQuery));
        if (!titleMatch && !catMatch && !tagMatch) return false;
      }
      return true;
    });
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

      card.innerHTML = `
        <img src="${imgSrc}" class="gallery-img" alt="${item.title}" loading="${index < 8 ? 'eager' : 'lazy'}">
        
        <div class="check-badge">
          <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        <div class="card-overlay">
          <span class="card-category-badge">${item.category.toUpperCase()}</span>
          <div class="card-title-text">${item.title}</div>
          <div class="card-id-tag">#${item.id}</div>
        </div>
      `;

      card.addEventListener("click", () => this.toggleItem(item.id, card));
      this.gridEl.appendChild(card);
    });

    this.updateCounters();
  }

  toggleItem(id, cardEl) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      cardEl.classList.remove("is-checked");
      cardEl.setAttribute("aria-checked", "false");
    } else {
      this.selectedIds.add(id);
      cardEl.classList.add("is-checked");
      cardEl.setAttribute("aria-checked", "true");
    }
    try {
      localStorage.setItem("sv_curated_active_ids", JSON.stringify(Array.from(this.selectedIds)));
    } catch (e) {}
    this.updateCounters();
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
    const active = this.selectedIds.size;

    if (this.activeCountEl) this.activeCountEl.textContent = active;
    if (this.totalCountEl) this.totalCountEl.textContent = total;
    if (this.floatingActiveEl) this.floatingActiveEl.textContent = active;
    if (this.floatingTotalEl) this.floatingTotalEl.textContent = total;

    const counts = {};
    this.masterCatalog.forEach(it => {
      const c = it.category;
      counts[c] = (counts[c] || 0) + (this.selectedIds.has(it.id) ? 1 : 0);
    });

    const badgeAll = document.getElementById("badgeAll");
    if (badgeAll) badgeAll.textContent = active;

    const categories = ["Selected", "City", "Studio", "Creative", "Garda", "Towers", "Utility", "Artwear", "Front Hits", "Experimental"];
    categories.forEach(cat => {
      const badgeId = "badge" + cat.replace(/\s+/g, "");
      const b = document.getElementById(badgeId);
      if (b) b.textContent = counts[cat] || 0;
    });
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
