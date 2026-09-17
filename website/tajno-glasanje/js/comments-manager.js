/**
 * Studio Varaždin — Comments Manager (comments-manager.js)
 * Manages item comments/notes with instant localStorage caching, reactive event dispatching,
 * and background API synchronization.
 */

export class CommentsManager {
  constructor(options = {}) {
    this.storageKey = 'sv_item_comments';
    this.apiBase = this.resolveApiBase();
    this.comments = new Map(); // id -> { id, title, text, updatedAt, user }
    this.listeners = new Set();
    
    this.loadFromStorage();
  }

  resolveApiBase() {
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

  isLocal() {
    try {
      const host = window.location.hostname;
      return (
        !host ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.endsWith('.local') ||
        window.location.protocol === 'file:'
      );
    } catch (e) {
      return false;
    }
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          Object.entries(parsed).forEach(([id, data]) => {
            if (typeof data === 'string') {
              this.comments.set(id, {
                id,
                title: id,
                text: data,
                updatedAt: Date.now(),
                user: 'Korisnik'
              });
            } else if (data && data.text) {
              this.comments.set(id, data);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load comments from storage:', e);
    }
  }

  saveToStorage() {
    try {
      const obj = {};
      this.comments.forEach((val, key) => {
        obj[key] = val;
      });
      localStorage.setItem(this.storageKey, JSON.stringify(obj));
    } catch (e) {
      console.warn('Failed to save comments to storage:', e);
    }
  }

  getComment(id) {
    if (!id) return null;
    return this.comments.get(id) || null;
  }

  getCommentText(id) {
    const c = this.getComment(id);
    return c ? c.text : '';
  }

  hasComment(id) {
    if (!id) return false;
    const c = this.comments.get(id);
    return !!(c && c.text && c.text.trim().length > 0);
  }

  getAllComments() {
    return Array.from(this.comments.values());
  }

  getAllCommentedIds() {
    const ids = new Set();
    this.comments.forEach((val, key) => {
      if (val && val.text && val.text.trim().length > 0) {
        ids.add(key);
      }
    });
    return ids;
  }

  getCommentCount() {
    return this.getAllCommentedIds().size;
  }

  async saveComment(id, text, title = '', category = '') {
    if (!id) return null;
    const cleanText = (text || '').trim();

    if (!cleanText) {
      return this.deleteComment(id);
    }

    const commentData = {
      id,
      title: title || id,
      category: category || 'ARTWEAR',
      text: cleanText,
      updatedAt: Date.now(),
      user: 'Ti'
    };

    this.comments.set(id, commentData);
    this.saveToStorage();
    this.notifyChange('save', commentData);

    // Sync to backend
    this.syncCommentToApi(commentData, 'save');
    return commentData;
  }

  async deleteComment(id) {
    if (!id) return false;
    const existed = this.comments.get(id);
    this.comments.delete(id);
    this.saveToStorage();
    this.notifyChange('delete', { id });

    // Sync deletion to backend
    if (existed) {
      this.syncCommentToApi({ id }, 'delete');
    }
    return true;
  }

  notifyChange(action, data) {
    const event = new CustomEvent('sv-comments-updated', {
      detail: { action, data, count: this.getCommentCount() }
    });
    window.dispatchEvent(event);
  }

  async syncCommentToApi(data, action = 'save') {
    try {
      const payload = {
        action: action === 'delete' ? 'delete' : 'save',
        id: data.id,
        title: data.title || data.id,
        category: data.category || '',
        text: data.text || '',
        updatedAt: data.updatedAt || Date.now(),
        sessionId: localStorage.getItem('sv_swiper_session_id') || 'anon'
      };

      await fetch(`${this.apiBase}/comment.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Offline fallback: comment is already safely in localStorage
    }
  }

  async fetchServerComments() {
    try {
      const res = await fetch(`${this.apiBase}/comment.php?t=${Date.now()}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.status === 'success' && Array.isArray(json.comments)) {
          let updated = false;
          json.comments.forEach(c => {
            if (c && c.id && c.text) {
              const local = this.comments.get(c.id);
              // Server wins if newer or if local doesn't have it
              if (!local || (c.updatedAt && (!local.updatedAt || c.updatedAt >= local.updatedAt))) {
                this.comments.set(c.id, c);
                updated = true;
              }
            }
          });
          if (updated) {
            this.saveToStorage();
            this.notifyChange('sync', { count: this.getCommentCount() });
          }
        }
      }
    } catch (e) {
      // Offline or static server
    }
  }
}

// Global Singleton Instance
export const globalCommentsManager = new CommentsManager();
