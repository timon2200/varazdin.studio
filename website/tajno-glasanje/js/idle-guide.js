/**
 * Studio Varaždin — Idle Guide Controller
 * Senses user inactivity (~3s) and displays subtle, elegant kinetic hints:
 * 1. Gentle organic card teasing ("kao da kartica želi otići")
 * 2. Breathing instruction badges (fade in/out text)
 * 3. Directional key & button pulse
 * Immediately dismisses with zero latency upon any user interaction.
 */

export class IdleGuide {
  constructor(options = {}) {
    this.app = options.app;
    this.idleTimeoutMs = options.timeout || 3200;
    this.idleTimer = null;
    this.isIdle = false;

    this.initListeners();
    this.resetTimer();
  }

  initListeners() {
    const userEvents = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll', 'click', 'wheel'];
    const onUserActivity = () => {
      if (this.isIdle) {
        this.dismiss();
      }
      this.resetTimer();
    };

    userEvents.forEach(evt => {
      window.addEventListener(evt, onUserActivity, { passive: true });
    });
  }

  resetTimer() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.triggerIdle();
    }, this.idleTimeoutMs);
  }

  triggerIdle() {
    if (this.isIdle) return;
    const currentView = this.app ? this.app.currentView : 'swiper';

    if (currentView === 'swiper') {
      this.activateSwiperIdle();
    } else if (currentView === 'compare') {
      this.activateDuelIdle();
    }
  }

  activateSwiperIdle() {
    this.isIdle = true;
    
    // 1. Add teasing animation to active top card
    const cardEngine = this.app ? this.app.cardEngine : null;
    if (cardEngine && cardEngine.cardsEl && cardEngine.cardsEl.length > cardEngine.currentIndex) {
      const topCard = cardEngine.cardsEl[cardEngine.currentIndex];
      if (topCard && !cardEngine.isDragging) {
        topCard.classList.add('is-idle-teasing');
      }
    }

    // 2. Show floating instruction pill in swiper stage
    const swiperPill = document.getElementById('idleGuideSwiper');
    if (swiperPill) {
      swiperPill.classList.add('is-active');
    }

    // 3. Pulse retro key chips
    const chipPass = document.getElementById('retroKeyPass');
    const chipLike = document.getElementById('retroKeyLike');
    if (chipPass) chipPass.classList.add('is-idle-pulse');
    if (chipLike) chipLike.classList.add('is-idle-pulse');
  }

  activateDuelIdle() {
    this.isIdle = true;

    // 1. Add teasing to duel cards
    const leftCard = document.querySelector('.slot-left .duel-card');
    const rightCard = document.querySelector('.slot-right .duel-card');
    if (leftCard) leftCard.classList.add('is-idle-teasing');
    if (rightCard) rightCard.classList.add('is-idle-teasing');

    // 2. Show floating instruction pill in duel stage
    const duelPill = document.getElementById('idleGuideDuel');
    if (duelPill) {
      duelPill.classList.add('is-active');
    }

    // 3. Pulse retro duel chips
    const chipLeft = document.getElementById('retroDuelLeft');
    const chipRight = document.getElementById('retroDuelRight');
    if (chipLeft) chipLeft.classList.add('is-idle-pulse');
    if (chipRight) chipRight.classList.add('is-idle-pulse');
  }

  dismiss() {
    if (!this.isIdle) return;
    this.isIdle = false;

    // Remove classes from all cards
    document.querySelectorAll('.is-idle-teasing').forEach(el => {
      el.classList.remove('is-idle-teasing');
    });

    // Hide instruction pills
    const swiperPill = document.getElementById('idleGuideSwiper');
    if (swiperPill) swiperPill.classList.remove('is-active');

    const duelPill = document.getElementById('idleGuideDuel');
    if (duelPill) duelPill.classList.remove('is-active');

    // Remove pulse from chips
    document.querySelectorAll('.is-idle-pulse').forEach(el => {
      el.classList.remove('is-idle-pulse');
    });
  }

  stop() {
    clearTimeout(this.idleTimer);
    this.dismiss();
  }
}
