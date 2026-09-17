/**
 * Studio Varaždin — Minimal Comment Tooltip Component (comment-tooltip.js)
 * Ultra-simple, uncluttered floating text box with top-right X and bottom-right checkmark.
 */

import { globalCommentsManager } from './comments-manager.js';

export class CommentTooltip {
  constructor(options = {}) {
    this.commentsManager = options.commentsManager || globalCommentsManager;
    this.audioHaptics = options.audioHaptics || null;
    this.onSaveCallback = options.onSave || (() => {});
    this.onDeleteCallback = options.onDelete || (() => {});
    
    this.overlayEl = null;
    this.tooltipEl = null;
    this.currentItem = null;
    this.isOpen = false;
    this.keyHandler = null;

    this.initDOM();
  }

  initDOM() {
    if (typeof document === 'undefined') return;
    let existing = document.getElementById('svCommentTooltipOverlay');
    if (existing) {
      this.overlayEl = existing;
      this.tooltipEl = document.getElementById('svCommentTooltipCard');
      return;
    }

    const mount = () => {
      if (document.getElementById('svCommentTooltipOverlay')) return;
      const overlay = document.createElement('div');
      overlay.id = 'svCommentTooltipOverlay';
      overlay.className = 'comment-tooltip-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.display = 'none';

      overlay.innerHTML = `
        <div id="svCommentTooltipCard" class="comment-box-minimal" role="dialog" aria-modal="true" aria-label="Bilješka">
          <textarea id="commentTextInput" 
                    class="comment-minimal-textarea" 
                    placeholder="Upiši bilješku..."
                    rows="3"
                    spellcheck="false"></textarea>

          <button type="button" id="btnTooltipSave" class="comment-btn-check" aria-label="Spremi" title="Spremi (Enter)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
        </div>
      `;

      if (document.body) {
        document.body.appendChild(overlay);
        this.overlayEl = overlay;
        this.tooltipEl = overlay.querySelector('#svCommentTooltipCard');
        this.bindEvents();
      }
    };

    if (document.body) {
      mount();
    } else {
      document.addEventListener('DOMContentLoaded', mount);
    }
  }

  bindEvents() {
    const btnSave = this.overlayEl.querySelector('#btnTooltipSave');

    // Click Outside overlay to close
    this.overlayEl.addEventListener('click', (e) => {
      if (e.target === this.overlayEl) {
        this.close();
      }
    });

    if (btnSave) btnSave.addEventListener('click', () => this.handleSave());
  }

  open(item, anchorCoords = null) {
    if (!item || !item.id) return;
    this.currentItem = item;
    this.isOpen = true;

    const textarea = this.overlayEl.querySelector('#commentTextInput');
    const existingComment = this.commentsManager.getComment(item.id);
    if (textarea) {
      textarea.value = existingComment ? existingComment.text : '';
    }

    this.positionTooltip(anchorCoords);

    this.overlayEl.style.display = 'flex';
    this.overlayEl.setAttribute('aria-hidden', 'false');
    this.overlayEl.classList.remove('is-closing');
    this.overlayEl.classList.add('is-open');
    this.overlayEl.classList.add('active');

    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }, 40);

    this.keyHandler = (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        this.handleSave();
      }
    };
    window.addEventListener('keydown', this.keyHandler, true);

    if (this.audioHaptics) {
      this.audioHaptics.playTap();
    }
  }

  positionTooltip(coords) {
    if (!this.tooltipEl) return;

    if (!coords || typeof coords.x !== 'number') {
      this.tooltipEl.style.position = 'relative';
      this.tooltipEl.style.top = '';
      this.tooltipEl.style.left = '';
      this.tooltipEl.style.transform = '';
      return;
    }

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const cardW = Math.min(320, winW - 32);
    const cardH = 100;

    let targetX = coords.x;
    let targetY = coords.y;

    let left = targetX - cardW / 2;
    let top = targetY - cardH / 2;

    if (left < 16) left = 16;
    if (left + cardW > winW - 16) left = winW - cardW - 16;

    if (top < 16) top = 16;
    if (top + cardH > winH - 16) top = winH - cardH - 16;

    if (winW > 500) {
      this.tooltipEl.style.position = 'absolute';
      this.tooltipEl.style.left = `${left}px`;
      this.tooltipEl.style.top = `${top}px`;
    } else {
      this.tooltipEl.style.position = 'relative';
      this.tooltipEl.style.left = '';
      this.tooltipEl.style.top = '';
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }

    this.overlayEl.classList.remove('is-open');
    this.overlayEl.classList.remove('active');
    this.overlayEl.classList.add('is-closing');

    setTimeout(() => {
      this.overlayEl.style.display = 'none';
      this.overlayEl.classList.remove('is-closing');
      this.overlayEl.setAttribute('aria-hidden', 'true');
    }, 180);

    if (this.audioHaptics) {
      this.audioHaptics.playTap();
    }
  }

  async handleSave() {
    if (!this.currentItem) return;
    const textarea = this.overlayEl.querySelector('#commentTextInput');
    const text = textarea ? textarea.value.trim() : '';

    const saved = await this.commentsManager.saveComment(
      this.currentItem.id,
      text,
      this.currentItem.title,
      this.currentItem.category
    );

    this.onSaveCallback({ item: this.currentItem, comment: saved });
    this.close();

    if (window.app && typeof window.app.showToast === 'function') {
      window.app.showToast(text ? '✓ Bilješka spremljena' : 'Bilješka uklonjena');
    }
  }

  async handleDelete() {
    if (!this.currentItem) return;
    await this.commentsManager.deleteComment(this.currentItem.id);
    this.onDeleteCallback({ item: this.currentItem });
    this.close();

    if (window.app && typeof window.app.showToast === 'function') {
      window.app.showToast('Bilješka obrisana');
    }
  }
}

// Global Singleton Instance
export const globalCommentTooltip = new CommentTooltip();
