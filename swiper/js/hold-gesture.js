/**
 * Studio Varaždin — Hold Gesture & Radial Charging Feedback Engine (hold-gesture.js)
 * Provides long-press detection with a 0.5s silent delay before showing any UI,
 * ensuring zero interference, flashing, or confusion during dragging and swiping.
 */

export class HoldGestureEngine {
  constructor(options = {}) {
    this.delay = options.delay || 500; // ms to wait before showing any indicator
    this.chargeDuration = options.chargeDuration || 600; // ms for charge circle to fill
    this.moveTolerance = options.moveTolerance || 8; // px before canceling
    this.audioHaptics = options.audioHaptics || null;
  }

  /**
   * Mounts a long-press detector on a card element.
   * @param {HTMLElement} element 
   * @param {Object} callbacks - { getItem, onTrigger, onCancel }
   * @returns {Function} cleanup function
   */
  attach(element, callbacks = {}) {
    if (!element) return () => {};

    let startX = 0;
    let startY = 0;
    let delayTimer = null;
    let chargeTimer = null;
    let isListening = false;
    let isHolding = false;
    let holdTriggered = false;
    let currentIndicator = null;
    let pointerId = null;

    const getItemData = () => {
      if (typeof callbacks.getItem === 'function') return callbacks.getItem();
      return callbacks.item || null;
    };

    const removeIndicator = () => {
      if (currentIndicator && currentIndicator.parentNode) {
        currentIndicator.remove();
      }
      currentIndicator = null;
    };

    const cleanup = () => {
      if (delayTimer) {
        clearTimeout(delayTimer);
        delayTimer = null;
      }
      if (chargeTimer) {
        clearTimeout(chargeTimer);
        chargeTimer = null;
      }
      if (isHolding) {
        element.classList.remove('is-holding');
        removeIndicator();
        if (typeof callbacks.onCancel === 'function' && !holdTriggered) {
          callbacks.onCancel();
        }
      }
      isListening = false;
      isHolding = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerCancel);
    };

    const startCharging = () => {
      if (!isListening) return;
      isHolding = true;
      element.classList.add('is-holding');

      // Create dynamic charging indicator at cursor / touch position
      removeIndicator();
      currentIndicator = document.createElement('div');
      currentIndicator.className = 'card-charge-indicator';
      currentIndicator.style.left = `${startX}px`;
      currentIndicator.style.top = `${startY}px`;

      currentIndicator.innerHTML = `
        <div class="charge-meter-wrap">
          <svg class="charge-svg" viewBox="0 0 48 48">
            <circle class="charge-bg-circle" cx="24" cy="24" r="20"></circle>
            <circle class="charge-progress-circle" cx="24" cy="24" r="20"></circle>
          </svg>
          <div class="charge-center-icon">💬</div>
        </div>
        <div class="charge-label-chip">DRŽI ZA BILJEŠKU</div>
      `;

      document.body.appendChild(currentIndicator);

      // Animate progress circle stroke
      const circle = currentIndicator.querySelector('.charge-progress-circle');
      requestAnimationFrame(() => {
        if (circle) {
          circle.style.transition = `stroke-dashoffset ${this.chargeDuration}ms cubic-bezier(0.1, 0.7, 0.1, 1)`;
          circle.style.strokeDashoffset = '0';
        }
      });

      // Start charge timer
      chargeTimer = setTimeout(() => {
        if (!isHolding) return;
        holdTriggered = true;
        isHolding = false;
        chargeTimer = null;

        element.classList.remove('is-holding');
        element.classList.add('is-hold-activated');
        setTimeout(() => element.classList.remove('is-hold-activated'), 400);

        removeIndicator();

        if (this.audioHaptics) {
          this.audioHaptics.playTap();
        }

        const itemData = getItemData();
        if (typeof callbacks.onTrigger === 'function') {
          callbacks.onTrigger({
            item: itemData,
            x: startX,
            y: startY,
            element
          });
        }
        cleanup();
      }, this.chargeDuration);
    };

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      
      // Ignore clicks on buttons/inputs inside card
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('a')) {
        return;
      }

      startX = e.clientX;
      startY = e.clientY;
      holdTriggered = false;
      isListening = true;
      isHolding = false;
      pointerId = e.pointerId;

      // Start initial silent delay timer (0.5s wait before showing anything)
      delayTimer = setTimeout(() => {
        startCharging();
      }, this.delay);

      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerup', onPointerEnd, { passive: true });
      window.addEventListener('pointercancel', onPointerCancel, { passive: true });
    };

    const onPointerMove = (e) => {
      if (!isListening) return;
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist > this.moveTolerance) {
        cleanup();
      }
    };

    const onPointerEnd = () => {
      cleanup();
    };

    element.addEventListener('pointerdown', onPointerDown, { passive: true });

    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      cleanup();
    };
  }
}

// Global Singleton Instance
export const globalHoldGesture = new HoldGestureEngine();
