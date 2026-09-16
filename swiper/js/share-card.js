/**
 * Studio Varaždin — Viral Share Card Generator
 * Renders high-res 1080x1920 Instagram Story / Social summary cards using HTML5 Canvas.
 */

export class ShareCardGenerator {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1080;
    this.canvas.height = 1920;
    this.ctx = this.canvas.getContext('2d');
  }

  async generateStoryCard(topFavorites = [], qrUrl = window.location.href) {
    const ctx = this.ctx;
    const w = 1080;
    const h = 1920;

    // 1. Deep Black / Charcoal Textured Background
    ctx.fillStyle = '#090B0A';
    ctx.fillRect(0, 0, w, h);

    // Subtle Radial Vignette
    const radial = ctx.createRadialGradient(w / 2, h / 2, 200, w / 2, h / 2, 900);
    radial.addColorStop(0, 'rgba(30, 20, 18, 0.4)');
    radial.addColorStop(1, 'rgba(5, 6, 5, 0.95)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, w, h);

    // 2. Gritty Noise Grain Layer
    const noiseData = ctx.createImageData(w, h);
    const buf = new Uint32Array(noiseData.data.buffer);
    for (let i = 0; i < buf.length; i++) {
      if (Math.random() < 0.12) {
        const val = (Math.random() * 255) | 0;
        buf[i] = (255 << 24) | (val << 16) | (val << 8) | val;
      }
    }
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCanvas.getContext('2d').putImageData(noiseData, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();

    // 3. Cyber-Medieval Techwear Borders & Frame
    ctx.strokeStyle = '#D0A041';
    ctx.lineWidth = 3;
    ctx.strokeRect(50, 50, w - 100, h - 100);

    ctx.strokeStyle = '#E60000';
    ctx.lineWidth = 1;
    ctx.strokeRect(62, 62, w - 124, h - 124);

    // Corner Reticles / Crosshairs
    this.drawReticle(ctx, 50, 50);
    this.drawReticle(ctx, w - 50, 50);
    this.drawReticle(ctx, 50, h - 50);
    this.drawReticle(ctx, w - 50, h - 50);

    // 4. Header: Studio Varaždin & cCc
    ctx.fillStyle = '#D0A041';
    ctx.font = '700 32px "Courier New", monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '8px';
    ctx.fillText('STUDIO VARAŽDIN · cCc.', w / 2, 130);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 64px system-ui, -apple-system, sans-serif';
    ctx.letterSpacing = '4px';
    ctx.fillText('MY TOP 3 SELECTIONS', w / 2, 210);

    ctx.fillStyle = '#E60000';
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText('STUDIO ARCHIVE • 1181 • T-SHIRT RANKING', w / 2, 260);

    // 5. Render Top 3 Items
    const itemsToRender = topFavorites.slice(0, 3);
    const startY = 320;
    const cardH = 380;
    const gap = 45;

    for (let i = 0; i < 3; i++) {
      const item = itemsToRender[i];
      const y = startY + i * (cardH + gap);

      // Card Container Box
      ctx.fillStyle = '#121614';
      ctx.fillRect(90, y, w - 180, cardH);
      ctx.strokeStyle = i === 0 ? '#D0A041' : '#2A342E';
      ctx.lineWidth = i === 0 ? 3 : 1.5;
      ctx.strokeRect(90, y, w - 180, cardH);

      // Rank Badge
      const badgeText = i === 0 ? '★ #1 FAVORITE' : `#${i + 1} PICK`;
      ctx.fillStyle = i === 0 ? '#E60000' : '#1A231E';
      ctx.fillRect(110, y + 20, 200, 44);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, 210, y + 49);

      if (item) {
        // Load and draw thumbnail image
        try {
          const imgUrl = this.resolveImageUrl(item);
          const img = await this.loadImage(imgUrl);
          // Draw shirt artwork
          ctx.drawImage(img, 120, y + 80, 260, 280);
        } catch (e) {
          // Fallback box
          ctx.fillStyle = '#1D2520';
          ctx.fillRect(120, y + 80, 260, 280);
        }

        // Title & Category
        ctx.textAlign = 'left';
        ctx.fillStyle = '#D0A041';
        ctx.font = '700 22px system-ui, sans-serif';
        ctx.fillText(item.category.toUpperCase() + ' SERIES', 420, y + 130);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 38px system-ui, -apple-system, sans-serif';
        const displayTitle = item.title.length > 24 ? item.title.substring(0, 22) + '...' : item.title;
        ctx.fillText(displayTitle, 420, y + 180);

        ctx.fillStyle = '#8E9E94';
        ctx.font = '500 22px system-ui, sans-serif';
        ctx.fillText('VARAŽDIN STREETWEAR', 420, y + 225);

        // Verification Seal
        ctx.strokeStyle = '#4E110C';
        ctx.strokeRect(420, y + 260, 220, 40);
        ctx.fillStyle = '#FF4D4D';
        ctx.font = '700 18px monospace';
        ctx.fillText('VERIFIED SELECTION', 435, y + 286);
      } else {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#4B5951';
        ctx.font = '600 28px system-ui, sans-serif';
        ctx.fillText('NO PICK RECORDED', w / 2, y + 200);
      }
    }

    // 6. Footer Call-to-Action & QR / URL
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.fillText('SWIPE & RANK YOUR FAVORITES', w / 2, 1660);

    ctx.fillStyle = '#D0A041';
    ctx.font = '700 28px "Courier New", monospace';
    ctx.fillText('varazdin.studio/swiper', w / 2, 1720);

    ctx.fillStyle = '#5A6A61';
    ctx.font = '500 20px system-ui, sans-serif';
    ctx.fillText('CREATIVE COLLECTIVE CROATIA · 1181', w / 2, 1780);

    return this.canvas.toDataURL('image/png');
  }

  drawReticle(ctx, x, y) {
    ctx.strokeStyle = '#D0A041';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x + 15, y);
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x, y + 15);
    ctx.stroke();
  }

  resolveImageUrl(item) {
    if (!item) return '';
    let raw = typeof item === 'string' ? item : (item.image || '');
    if (!raw && item.title) {
      raw = `assets/optimized/${item.title}.webp`;
    }
    const opt = raw.includes('assets/optimized/') ? raw : raw.replace('assets/designs/', 'assets/optimized/').replace(/\.(png|jpg)$/, '.webp');
    return encodeURI(opt);
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async shareOrDownload(topFavorites) {
    const dataUrl = await this.generateStoryCard(topFavorites);

    // Convert dataURL to Blob
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], 'studio_varazdin_my_top3.png', { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'My Top 3 Studio Varaždin T-Shirts',
          text: 'Pogledaj moje favorite Studio Varaždin & cCc majica i glasaj za svoje!',
          url: window.location.href,
          files: [file]
        });
        return { shared: true };
      } catch (e) {
        // User cancelled or fallback
      }
    }

    // Direct Download fallback
    const link = document.createElement('a');
    link.download = 'studio_varazdin_my_top3.png';
    link.href = dataUrl;
    link.click();
    return { downloaded: true };
  }
}
