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
    this.activeCatalog = [...ACTIVE_CATALOG];
    this.selectedIds = new Set(this.activeCatalog.map(it => it.id));
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
    // 1. Initialize film grain texture
    try {
      new NoiseGrain({ opacity: 0.05, fps: 24 });
    } catch (e) {}

    // 2. Bind UI event listeners
    this.bindEvents();

    // 3. Render immediately from local master bundle (instant 0ms load)
    this.render();

    // 4. Background sync with backend API if available
    this.syncWithBackend();
  }

  async syncWithBackend() {
    try {
      const res = await fetch("api/curate.php?t=" + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success") {
          if (Array.isArray(data.master) && data.master.length > 0) {
            this.masterCatalog = data.master;
          }
          if (Array.isArray(data.active) && data.active.length > 0) {
            this.activeCatalog = data.active;
            this.selectedIds = new Set(this.activeCatalog.map(it => it.id));
            this.render();
          }
        }
      }
    } catch (e) {
      // Offline / Static mode: local dataset already rendered
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

    // Save Buttons
    document.getElementById("btnSave")?.addEventListener("click", () => this.saveCuratedCatalog());
    document.getElementById("btnSaveFloating")?.addEventListener("click", () => this.saveCuratedCatalog());
  }

  getFilteredItems() {
    return this.masterCatalog.filter(item => {
      // Category filter
      if (this.activeCategory !== "ALL") {
        if (item.category.toUpperCase() !== this.activeCategory.toUpperCase()) {
          return false;
        }
      }
      // Search filter
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
        
        <!-- High-contrast selection badge -->
        <div class="check-badge">
          <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        <!-- Meta Hover Overlay -->
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
    this.updateCounters();
  }

  selectAllFiltered(select = true) {
    const filtered = this.getFilteredItems();
    filtered.forEach(it => {
      if (select) this.selectedIds.add(it.id);
      else this.selectedIds.delete(it.id);
    });
    this.render();
  }

  invertFiltered() {
    const filtered = this.getFilteredItems();
    filtered.forEach(it => {
      if (this.selectedIds.has(it.id)) this.selectedIds.delete(it.id);
      else this.selectedIds.add(it.id);
    });
    this.render();
  }

  cleanSmartDuplicates() {
    // Keeps primary variant and deselects redundant colorway/text clones
    const seenBase = new Map();
    let cleanedCount = 0;

    this.masterCatalog.forEach(item => {
      // Normalize base name (strip colorways and suffix variations)
      const baseName = item.title
        .replace(/\b(Black on White|White on Black|Studio Black|Studio Sunburst|Flare|Sunburst|White|Black|Cream)\b/gi, "")
        .replace(/[-_\s]+/g, " ")
        .trim().toLowerCase();

      if (seenBase.has(baseName)) {
        // Deselect secondary clone
        this.selectedIds.delete(item.id);
        cleanedCount++;
      } else {
        seenBase.set(baseName, item.id);
        this.selectedIds.add(item.id);
      }
    });

    this.render();
    this.showToast(`⚡ Pametni filter: ${cleanedCount} varijanti/duplikata isključeno.`);
  }

  updateCounters() {
    const total = this.masterCatalog.length;
    const active = this.selectedIds.size;

    if (this.activeCountEl) this.activeCountEl.textContent = active;
    if (this.totalCountEl) this.totalCountEl.textContent = total;
    if (this.floatingActiveEl) this.floatingActiveEl.textContent = active;
    if (this.floatingTotalEl) this.floatingTotalEl.textContent = total;

    // Update category badges
    const counts = {};
    this.masterCatalog.forEach(it => {
      const c = it.category;
      counts[c] = (counts[c] || 0) + (this.selectedIds.has(it.id) ? 1 : 0);
    });

    const badgeAll = document.getElementById("badgeAll");
    if (badgeAll) badgeAll.textContent = active;

    ["Artwear", "Creative", "City", "Garda", "Studio", "Towers"].forEach(cat => {
      const b = document.getElementById(`badge${cat}`);
      if (b) b.textContent = counts[cat] || 0;
    });
  }

  async saveCuratedCatalog() {
    const activeItems = this.masterCatalog.filter(it => this.selectedIds.has(it.id));
    const payload = {
      activeIds: Array.from(this.selectedIds),
      activeItems: activeItems
    };

    const btn = document.getElementById("btnSave");
    const originalText = btn ? btn.innerHTML : "";
    if (btn) btn.innerHTML = "<span>SPREMANJE...</span>";

    try {
      const res = await fetch("api/curate.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        this.showToast(`✓ Spremljeno! Aktivno ${activeItems.length} majica u Swiperu.`);
      } else {
        throw new Error("API Greška");
      }
    } catch (err) {
      console.warn("Backend save fallback to localStorage", err);
      // Fallback: save to localStorage
      localStorage.setItem("sv_curated_active_ids", JSON.stringify(Array.from(this.selectedIds)));
      this.showToast(`✓ Odabir zabilježen (${activeItems.length} majica).`);
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
    }, 3200);
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
