/**
 * Studio Varaždin — Procedural Noise Grain Engine
 * Renders an analog film grain / gritty streetwear texture overlay.
 */

export class NoiseGrain {
  constructor(options = {}) {
    this.canvas = null;
    this.ctx = null;
    this.width = 0;
    this.height = 0;
    this.opacity = options.opacity || 0.085;
    this.density = options.density || 0.7;
    this.fps = options.fps || 24;
    this.enabled = true;
    this.animId = null;
    this.lastFrameTime = 0;
    this.noisePatternCanvas = null;
    this.patternSize = 160; // Fast 160x160 tileable noise buffer
    
    this.init();
  }

  init() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'grain-canvas';
    this.canvas.className = 'grain-overlay';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    
    document.body.prepend(this.canvas);
    
    this.createNoisePattern();
    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });
    
    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      this.renderStatic();
    } else {
      this.startLoop();
    }
  }

  createNoisePattern() {
    this.noisePatternCanvas = document.createElement('canvas');
    this.noisePatternCanvas.width = this.patternSize;
    this.noisePatternCanvas.height = this.patternSize;
    this.patternCtx = this.noisePatternCanvas.getContext('2d');
  }

  generateNoiseTile() {
    const w = this.patternSize;
    const h = this.patternSize;
    const imgData = this.patternCtx.createImageData(w, h);
    const buffer32 = new Uint32Array(imgData.data.buffer);
    const len = buffer32.length;
    
    for (let i = 0; i < len; i++) {
      if (Math.random() < this.density) {
        const val = (Math.random() * 255) | 0;
        // Gritty monochrome grain with subtle variance
        buffer32[i] = (255 << 24) | (val << 16) | (val << 8) | val;
      } else {
        buffer32[i] = 0;
      }
    }
    this.patternCtx.putImageData(imgData, 0, 0);
  }

  resize() {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
    this.render();
  }

  render() {
    if (!this.ctx) return;
    this.generateNoiseTile();
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();
    this.ctx.globalAlpha = this.opacity;
    const pattern = this.ctx.createPattern(this.noisePatternCanvas, 'repeat');
    this.ctx.fillStyle = pattern;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.restore();
  }

  renderStatic() {
    this.render();
  }

  startLoop() {
    const frameInterval = 1000 / this.fps;
    const step = (timestamp) => {
      if (!this.enabled) return;
      if (timestamp - this.lastFrameTime >= frameInterval) {
        this.render();
        this.lastFrameTime = timestamp;
      }
      this.animId = requestAnimationFrame(step);
    };
    this.animId = requestAnimationFrame(step);
  }

  stopLoop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  toggle(enable) {
    this.enabled = enable !== undefined ? enable : !this.enabled;
    this.canvas.style.display = this.enabled ? 'block' : 'none';
    if (this.enabled && !this.animId) {
      this.startLoop();
    } else if (!this.enabled) {
      this.stopLoop();
    }
  }
}
