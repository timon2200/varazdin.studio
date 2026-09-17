/**
 * LightboxZoomEngine - Zero-dependency Pan & Pinch-to-Zoom Engine
 * Studio Varaždin Presentation Deck & Swiper Platform
 * 
 * Supports:
 * - 2-finger pinch to zoom & multi-touch panning with focal-point anchoring
 * - Double-tap / Double-click crop-to-zoom (toggles 1.0x <-> 2.5x at tap coordinate)
 * - Trackpad continuous pinch (e.ctrlKey) & wheel scroll zoom centered on cursor
 * - 1-finger & mouse drag panning when zoomed in (scale > 1)
 * - Elastic boundary clamping to prevent losing image out of viewport
 * - Dynamic HUD zoom level indicators and quick controls (+ / - / ⟲)
 */

export class LightboxZoomEngine {
  constructor(options = {}) {
    this.container = options.container || null;
    this.image = options.image || null;
    this.levelBadge = options.levelBadge || null;
    this.minScale = options.minScale || 1.0;
    this.maxScale = options.maxScale || 4.5;
    this.cropScale = options.cropScale || 2.5;
    this.onZoomChange = options.onZoomChange || null;

    // Transform state
    this.scale = 1.0;
    this.translateX = 0;
    this.translateY = 0;

    // Interaction flags
    this.isDragging = false;
    this.isPinching = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialTranslateX = 0;
    this.initialTranslateY = 0;
    this.initialScale = 1.0;

    // Touch state
    this.initialPinchDistance = 0;
    this.initialPinchCenter = { x: 0, y: 0 };
    this.lastTapTime = 0;
    this.lastTapPos = { x: 0, y: 0 };

    // Bound event handlers for clean attach/detach
    this._onWheel = this.handleWheel.bind(this);
    this._onMouseDown = this.handleMouseDown.bind(this);
    this._onMouseMove = this.handleMouseMove.bind(this);
    this._onMouseUp = this.handleMouseUp.bind(this);
    this._onDblClick = this.handleDblClick.bind(this);
    this._onTouchStart = this.handleTouchStart.bind(this);
    this._onTouchMove = this.handleTouchMove.bind(this);
    this._onTouchEnd = this.handleTouchEnd.bind(this);

    if (this.container && this.image) {
      this.attach(this.container, this.image);
    }
  }

  attach(container, image) {
    this.detach();
    this.container = container;
    this.image = image;

    if (!this.container || !this.image) return;

    // Style container & image for smooth hardware accelerated pan/zoom
    this.container.style.overflow = 'hidden';
    this.container.style.touchAction = 'none';
    this.container.style.userSelect = 'none';
    this.container.style.webkitUserSelect = 'none';

    this.image.style.transformOrigin = 'center center';
    this.image.style.willChange = 'transform';
    this.image.style.userSelect = 'none';
    this.image.style.webkitUserSelect = 'none';
    this.image.style.webkitUserDrag = 'none';

    // Passive: false is crucial for wheel & touch to prevent browser native scroll/zoom
    this.container.addEventListener('wheel', this._onWheel, { passive: false });
    this.container.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this.container.addEventListener('dblclick', this._onDblClick);

    this.container.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.container.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.container.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this.container.addEventListener('touchcancel', this._onTouchEnd, { passive: false });

    this.reset(false);
  }

  detach() {
    if (!this.container) return;
    this.container.removeEventListener('wheel', this._onWheel);
    this.container.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.container.removeEventListener('dblclick', this._onDblClick);

    this.container.removeEventListener('touchstart', this._onTouchStart);
    this.container.removeEventListener('touchmove', this._onTouchMove);
    this.container.removeEventListener('touchend', this._onTouchEnd);
    this.container.removeEventListener('touchcancel', this._onTouchEnd);
  }

  isZoomed() {
    return this.scale > 1.05;
  }

  reset(animate = true) {
    this.scale = 1.0;
    this.translateX = 0;
    this.translateY = 0;
    this.applyTransform(animate);
    this.updateCursor();
    this.updateBadge();
    if (typeof this.onZoomChange === 'function') {
      this.onZoomChange(this.scale, this.translateX, this.translateY);
    }
  }

  zoomIn(step = 0.5) {
    const targetScale = Math.min(this.maxScale, this.scale + step);
    this.zoomTo(targetScale, 0, 0, true);
  }

  zoomOut(step = 0.5) {
    const targetScale = Math.max(this.minScale, this.scale - step);
    this.zoomTo(targetScale, 0, 0, true);
  }

  toggleCropZoom(focalX = 0, focalY = 0) {
    if (this.isZoomed()) {
      this.reset(true);
    } else {
      this.zoomTo(this.cropScale, focalX, focalY, true);
    }
  }

  zoomTo(targetScale, focalX = 0, focalY = 0, animate = true) {
    targetScale = Math.max(this.minScale, Math.min(this.maxScale, targetScale));
    
    if (targetScale <= 1.01) {
      this.reset(animate);
      return;
    }

    const prevScale = this.scale;
    const ratio = targetScale / prevScale;

    // Focal point adjustment: anchor zoom to focal position
    this.translateX = focalX - (focalX - this.translateX) * ratio;
    this.translateY = focalY - (focalY - this.translateY) * ratio;
    this.scale = targetScale;

    this.clampBounds();
    this.applyTransform(animate);
    this.updateCursor();
    this.updateBadge();

    if (typeof this.onZoomChange === 'function') {
      this.onZoomChange(this.scale, this.translateX, this.translateY);
    }
  }

  // --- Wheel & Trackpad Pinch Handling ---
  handleWheel(e) {
    e.preventDefault();
    if (!this.container || !this.image) return;

    const rect = this.container.getBoundingClientRect();
    const focalX = e.clientX - (rect.left + rect.width / 2);
    const focalY = e.clientY - (rect.top + rect.height / 2);

    let factor = 1;
    if (e.ctrlKey) {
      // Trackpad pinch gesture (macOS Safari & Chrome)
      factor = Math.exp(-e.deltaY * 0.015);
    } else {
      // Regular mouse wheel scroll zoom
      factor = e.deltaY < 0 ? 1.15 : 0.87;
    }

    const targetScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
    if (Math.abs(targetScale - this.scale) < 0.001) return;

    const ratio = targetScale / this.scale;
    this.translateX = focalX - (focalX - this.translateX) * ratio;
    this.translateY = focalY - (focalY - this.translateY) * ratio;
    this.scale = targetScale;

    if (this.scale <= 1.01) {
      this.scale = 1.0;
      this.translateX = 0;
      this.translateY = 0;
    } else {
      this.clampBounds();
    }

    this.applyTransform(false);
    this.updateCursor();
    this.updateBadge();

    if (typeof this.onZoomChange === 'function') {
      this.onZoomChange(this.scale, this.translateX, this.translateY);
    }
  }

  // --- Mouse Drag Handling ---
  handleMouseDown(e) {
    if (e.button !== 0 || !this.isZoomed()) return;
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.initialTranslateX = this.translateX;
    this.initialTranslateY = this.translateY;
    this.updateCursor();
    e.preventDefault();
  }

  handleMouseMove(e) {
    if (!this.isDragging) return;
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;

    this.translateX = this.initialTranslateX + dx;
    this.translateY = this.initialTranslateY + dy;

    this.clampBounds();
    this.applyTransform(false);
  }

  handleMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.updateCursor();
    }
  }

  handleDblClick(e) {
    e.preventDefault();
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const focalX = e.clientX - (rect.left + rect.width / 2);
    const focalY = e.clientY - (rect.top + rect.height / 2);
    this.toggleCropZoom(focalX, focalY);
  }

  // --- Touch & Multi-Touch Pinch Handling ---
  handleTouchStart(e) {
    if (!this.container || !this.image) return;

    if (e.touches.length === 1) {
      const now = Date.now();
      const touch = e.touches[0];
      const rect = this.container.getBoundingClientRect();
      const touchX = touch.clientX;
      const touchY = touch.clientY;

      // Double-tap detection (< 320ms, < 35px distance)
      const distFromLastTap = Math.hypot(touchX - this.lastTapPos.x, touchY - this.lastTapPos.y);
      if (now - this.lastTapTime < 320 && distFromLastTap < 35) {
        e.preventDefault();
        const focalX = touchX - (rect.left + rect.width / 2);
        const focalY = touchY - (rect.top + rect.height / 2);
        this.toggleCropZoom(focalX, focalY);
        this.lastTapTime = 0;
        return;
      }
      this.lastTapTime = now;
      this.lastTapPos = { x: touchX, y: touchY };

      // Single-finger pan when zoomed in
      if (this.isZoomed()) {
        this.isDragging = true;
        this.dragStartX = touch.clientX;
        this.dragStartY = touch.clientY;
        this.initialTranslateX = this.translateX;
        this.initialTranslateY = this.translateY;
        e.preventDefault(); // Stop page scroll
      }
    } else if (e.touches.length === 2) {
      // 2-finger pinch start
      e.preventDefault();
      this.isPinching = true;
      this.isDragging = false;

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      this.initialPinchDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      this.initialScale = this.scale;
      this.initialTranslateX = this.translateX;
      this.initialTranslateY = this.translateY;

      const rect = this.container.getBoundingClientRect();
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      this.initialPinchCenter = {
        x: midX - (rect.left + rect.width / 2),
        y: midY - (rect.top + rect.height / 2)
      };
    }
  }

  handleTouchMove(e) {
    if (!this.container || !this.image) return;

    if (this.isPinching && e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (this.initialPinchDistance <= 0) return;

      const factor = dist / this.initialPinchDistance;
      let targetScale = this.initialScale * factor;
      // Allow slight elastic over-pinch
      targetScale = Math.max(0.8, Math.min(this.maxScale * 1.15, targetScale));

      const rect = this.container.getBoundingClientRect();
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const currentCenter = {
        x: midX - (rect.left + rect.width / 2),
        y: midY - (rect.top + rect.height / 2)
      };

      const ratio = targetScale / this.initialScale;
      this.scale = targetScale;
      this.translateX = currentCenter.x - (this.initialPinchCenter.x - this.initialTranslateX) * ratio;
      this.translateY = currentCenter.y - (this.initialPinchCenter.y - this.initialTranslateY) * ratio;

      this.applyTransform(false);
      this.updateBadge();
    } else if (this.isDragging && e.touches.length === 1 && this.isZoomed()) {
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - this.dragStartX;
      const dy = touch.clientY - this.dragStartY;

      this.translateX = this.initialTranslateX + dx;
      this.translateY = this.initialTranslateY + dy;

      this.clampBounds();
      this.applyTransform(false);
    }
  }

  handleTouchEnd(e) {
    if (this.isPinching) {
      if (e.touches.length < 2) {
        this.isPinching = false;
        // Snap back to bounds or 1x if pinched below 1x
        if (this.scale < 1.05) {
          this.reset(true);
        } else {
          this.scale = Math.min(this.maxScale, this.scale);
          this.clampBounds();
          this.applyTransform(true);
          this.updateCursor();
          this.updateBadge();
        }
      }
    }

    if (e.touches.length === 0) {
      this.isDragging = false;
      this.updateCursor();
    }
  }

  // --- Boundary Clamping ---
  clampBounds() {
    if (!this.container || !this.image) return;
    if (this.scale <= 1.0) {
      this.translateX = 0;
      this.translateY = 0;
      return;
    }

    const containerRect = this.container.getBoundingClientRect();
    const imgNaturalW = this.image.offsetWidth || containerRect.width;
    const imgNaturalH = this.image.offsetHeight || containerRect.height;

    const visualW = imgNaturalW * this.scale;
    const visualH = imgNaturalH * this.scale;

    const maxPanX = Math.max(0, (visualW - containerRect.width) / 2 + 40);
    const maxPanY = Math.max(0, (visualH - containerRect.height) / 2 + 40);

    this.translateX = Math.max(-maxPanX, Math.min(maxPanX, this.translateX));
    this.translateY = Math.max(-maxPanY, Math.min(maxPanY, this.translateY));
  }

  // --- Hardware-accelerated Transform ---
  applyTransform(animate = false) {
    if (!this.image) return;

    if (animate) {
      this.image.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
    } else {
      this.image.style.transition = 'none';
    }

    const tX = Math.round(this.translateX * 100) / 100;
    const tY = Math.round(this.translateY * 100) / 100;
    const s = Math.round(this.scale * 1000) / 1000;

    this.image.style.transform = `translate3d(${tX}px, ${tY}px, 0px) scale(${s})`;
  }

  updateCursor() {
    if (!this.image) return;
    if (this.isZoomed()) {
      this.image.style.cursor = this.isDragging ? 'grabbing' : 'grab';
    } else {
      this.image.style.cursor = 'zoom-in';
    }
  }

  updateBadge() {
    if (!this.levelBadge) return;
    const pct = Math.round(this.scale * 100);
    this.levelBadge.textContent = `${pct}%`;
    if (this.isZoomed()) {
      this.levelBadge.classList.add('is-zoomed');
    } else {
      this.levelBadge.classList.remove('is-zoomed');
    }
  }
}
