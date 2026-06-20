/* ============================================================
   Studio Varaždin — Project Expanded View & Video Player
   Netflix-style fullscreen project viewer with YouTube
   IFrame API integration, custom controls, scrubber, and
   idle-fade behavior.

   Depends on: data.js  (PROJECTS, CATEGORY_LABELS),
               main.js  (expandedView, expandedMedia, expandedGlass, activeProject, activeCard)
   ============================================================ */

'use strict';

let ytPlayer = null;
let ytInterval = null;
let idleTimeout = null;
let isVideoMuted = true;
let isVideoPlaying = false;

// ════════════════════════════════════════════════════════════
// OPEN / CLOSE
// ════════════════════════════════════════════════════════════

function openProject(projectId, cardEl) {
  const project = PROJECTS.find(p => p.id === projectId);
  if (!project) return;
  activeProject = project;
  activeCard = cardEl;

  const cardImg = cardEl ? cardEl.querySelector('.card-image img') : null;

  const updateDOM = () => {
    let ytHTML = '';
    let hasYoutube = false;
    let vidId = '';

    if (project.youtubeUrl) {
      const videoIdMatch = project.youtubeUrl.match(/(?:v=|\/)([\w-]{11})(?:\?|&|$)/);
      if (videoIdMatch && videoIdMatch[1]) {
        vidId = videoIdMatch[1];
        hasYoutube = true;
        ytHTML = `<div id="yt-player-target"></div>`;
      }
    }

    expandedMedia.innerHTML = `
      <div class="expanded-media-inner" id="expanded-media-inner">
        <img src="${project.heroImage}" alt="${project.title}" style="view-transition-name: project-image-expand">
        ${ytHTML}
      </div>
    `;

    const descRaw = project.description || '';
    const descHtml = descRaw.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');

    expandedGlass.innerHTML = `
      <div class="glass-content-box" style="view-transition-name: project-glass">
        <div class="glass-category glass-stagger">${CATEGORY_LABELS[project.category] || project.type}</div>
        <div class="glass-title glass-stagger">${project.title}</div>
        <div class="glass-client glass-stagger">Client: ${project.client || 'Studio Varaždin'}</div>
        <div class="glass-description glass-stagger">${descHtml}</div>
      </div>
    `;

    // Reset UI states
    const titleEl = document.getElementById('player-top-title');
    if (titleEl) titleEl.textContent = project.title;
    
    expandedView.classList.add('is-active');
    expandedView.classList.remove('player-idle');
    expandedGlass.classList.remove('is-minimized');

    // Show the external close button
    const closeBtn = document.getElementById('expanded-close-btn');
    if (closeBtn) closeBtn.classList.add('is-visible');
    
    // Default unmuted icon
    document.querySelectorAll('.icon-vol').forEach(el => el.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>');

    document.body.style.overflow = 'hidden';
    if (typeof resetIdleTimer === 'function') resetIdleTimer();

    // Push history state so browser back button closes the project
    history.pushState({ projectOpen: true, projectId: project.id }, '', '');

    if (hasYoutube) {
      setTimeout(() => initYoutubePlayer(vidId), 50);
    }
    
    // Default volume slider
    const volSlider = document.getElementById('player-vol-slider');
    if (volSlider) volSlider.value = 100;
  };

  if (document.startViewTransition) {
    if (cardImg) cardImg.style.viewTransitionName = 'project-image-expand';
    const transition = document.startViewTransition(updateDOM);
    transition.finished.then(() => {
      if (cardImg) cardImg.style.viewTransitionName = '';
    });
  } else {
    updateDOM();
  }
}

function closeProject(fromPopState) {
  if (!activeProject) return;
  
  // If not triggered by popstate, go back in history to clean up the pushed state
  if (!fromPopState && history.state && history.state.projectOpen) {
    history.back();
  }
  
  stopScrubberUpdate();
  clearTimeout(idleTimeout);
  
  if (ytPlayer && typeof ytPlayer.destroy === 'function') {
    ytPlayer.destroy();
    ytPlayer = null;
  }

  // Hide external close button
  const closeBtn = document.getElementById('expanded-close-btn');
  if (closeBtn) {
    closeBtn.classList.remove('is-visible');
    closeBtn.style.opacity = '';
  }

  // Hide dismiss backdrop
  const backdrop = document.getElementById('dismiss-backdrop');
  if (backdrop) {
    backdrop.classList.remove('is-visible');
    backdrop.style.opacity = '';
  }

  // Clear GSAP-managed transforms
  if (expandedView) {
    gsap.set(expandedView, { clearProps: 'y,scaleX,scaleY,opacity,borderRadius' });
    expandedView.style.overflow = '';
  }
  
  const updateDOM = () => {
    expandedView.classList.remove('is-active');
    expandedView.classList.remove('is-fullscreen');
    document.body.style.overflow = '';
    // Restore custom player UI visibility for next open
    const customUI = document.getElementById('custom-player-ui');
    if (customUI) customUI.style.display = '';
    expandedMedia.innerHTML = '';
    expandedGlass.innerHTML = '';
    if (expandedView) expandedView.scrollTo(0, 0);
  };

  if (document.startViewTransition && activeCard) {
    const cardImg = activeCard.querySelector('.card-image img');
    if (cardImg) cardImg.style.viewTransitionName = 'project-image-expand';
    
    const transition = document.startViewTransition(updateDOM);
    transition.finished.then(() => {
      if (cardImg) cardImg.style.viewTransitionName = '';
      activeProject = null;
      activeCard = null;
    });
  } else {
    updateDOM();
    activeProject = null;
    activeCard = null;
  }
}

// ════════════════════════════════════════════════════════════
// YOUTUBE PLAYER
// ════════════════════════════════════════════════════════════

function initYoutubePlayer(vidId) {
  if (typeof YT === 'undefined' || !YT.Player) {
    setTimeout(() => initYoutubePlayer(vidId), 100);
    return;
  }
  
  const mobile = window.innerWidth <= 900;

  ytPlayer = new YT.Player('yt-player-target', {
    videoId: vidId,
    playerVars: {
      autoplay: 1,
      mute: 0,                    // start with sound (user click = gesture)
      controls: mobile ? 1 : 0,   // native controls on mobile → real fullscreen
      loop: 1,
      playlist: vidId,
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
      showinfo: 0,
      iv_load_policy: 3,
      fs: 1                       // allow native fullscreen
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });

  setTimeout(() => {
    const iframe = document.getElementById('yt-player-target');
    if (iframe) {
      iframe.style.opacity = '0';
      iframe.style.transition = 'opacity 1.5s ease 0.5s';
      setTimeout(() => iframe.style.opacity = '1', 50);
    }
  }, 100);
}

function onPlayerReady(event) {
  // Unmute and set volume — user click satisfies autoplay policy
  event.target.unMute();
  event.target.setVolume(100);
  isVideoMuted = false;

  if (window.innerWidth <= 900) {
    // Hide custom player UI on mobile — native YouTube controls handle everything
    const customUI = document.getElementById('custom-player-ui');
    if (customUI) customUI.style.display = 'none';
  }

  isVideoPlaying = true;
  event.target.playVideo();
  startScrubberUpdate();
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    isVideoPlaying = true;
    document.querySelectorAll('.icon-play').forEach(el => el.innerHTML = '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>');
  } else {
    isVideoPlaying = false;
    document.querySelectorAll('.icon-play').forEach(el => el.innerHTML = '<polygon points="5,3 19,12 5,21" fill="currentColor"/>');
  }
}

// ════════════════════════════════════════════════════════════
// SCRUBBER / TIMELINE
// ════════════════════════════════════════════════════════════

function startScrubberUpdate() {
  if (ytInterval) clearInterval(ytInterval);
  ytInterval = setInterval(() => {
    if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getDuration) {
      const current = ytPlayer.getCurrentTime() || 0;
      const total = ytPlayer.getDuration() || 0;
      const pct = total > 0 ? (current / total) * 100 : 0;
      
      const fill = document.getElementById('player-timeline-fill');
      const handle = document.getElementById('player-timeline-handle');
      if (fill) fill.style.width = pct + '%';
      if (handle) handle.style.left = pct + '%';
      
      const formatTime = (time) => {
        const m = Math.floor(time / 60);
        const s = Math.floor(time % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
      };
      
      const display = document.getElementById('player-time-display');
      if (display) display.textContent = `${formatTime(current)} / ${formatTime(total)}`;
    }
  }, 250);
}

function stopScrubberUpdate() {
  if (ytInterval) clearInterval(ytInterval);
}

// ════════════════════════════════════════════════════════════
// PLAYBACK CONTROLS
// ════════════════════════════════════════════════════════════

function togglePlay() {
  if (!ytPlayer || !ytPlayer.getPlayerState) return;
  const state = ytPlayer.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    ytPlayer.pauseVideo();
    showCenterPulse('<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>');
  } else {
    ytPlayer.playVideo();
    showCenterPulse('<polygon points="5,3 19,12 5,21" fill="currentColor"/>');
  }
}

function toggleMute() {
  if (!ytPlayer || typeof ytPlayer.unMute !== 'function') return;
  
  if (isVideoMuted) {
    ytPlayer.unMute();
    ytPlayer.setVolume(100);
    isVideoMuted = false;
    document.querySelectorAll('.icon-vol').forEach(el => el.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>');
    const slider = document.getElementById('player-vol-slider');
    if (slider) slider.value = 100;
  } else {
    ytPlayer.mute();
    isVideoMuted = true;
    document.querySelectorAll('.icon-vol').forEach(el => el.innerHTML = '<path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM3 9v6h4l5 5V4L7 9H3zm16 3c0 3.28-2.01 6.22-5 7.43v2.06c4.01-1.37 7-4.8 7-9.49s-2.99-8.12-7-9.49v2.06c2.99 1.21 5 4.15 5 7.43z"/>');
    const slider = document.getElementById('player-vol-slider');
    if (slider) slider.value = 0;
  }
}

function setVolume(vol) {
  if (!ytPlayer || typeof ytPlayer.setVolume !== 'function') return;
  ytPlayer.setVolume(vol);
  
  if (vol > 0 && isVideoMuted) {
    ytPlayer.unMute();
    isVideoMuted = false;
    document.querySelectorAll('.icon-vol').forEach(el => el.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>');
  } else if (vol == 0 && !isVideoMuted) {
    ytPlayer.mute();
    isVideoMuted = true;
    document.querySelectorAll('.icon-vol').forEach(el => el.innerHTML = '<path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM3 9v6h4l5 5V4L7 9H3zm16 3c0 3.28-2.01 6.22-5 7.43v2.06c4.01-1.37 7-4.8 7-9.49s-2.99-8.12-7-9.49v2.06c2.99 1.21 5 4.15 5 7.43z"/>');
  }
}

// ════════════════════════════════════════════════════════════
// FULLSCREEN
// ════════════════════════════════════════════════════════════

function toggleFullscreen() {
  const elem = document.getElementById('project-expanded-view');
  const isFs = document.fullscreenElement || document.webkitFullscreenElement;

  if (isFs) {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } else {
    const fsPromise = elem.requestFullscreen
      ? elem.requestFullscreen()
      : elem.webkitRequestFullscreen
        ? elem.webkitRequestFullscreen()
        : null;

    if (fsPromise && typeof fsPromise.catch === 'function') {
      fsPromise.catch(() => {
        elem.classList.toggle('is-fullscreen');
      });
    } else if (!elem.requestFullscreen && !elem.webkitRequestFullscreen) {
      elem.classList.toggle('is-fullscreen');
    }
  }
}

// Desktop fullscreen event listeners
document.addEventListener('fullscreenchange', () => {
  const view = document.getElementById('project-expanded-view');
  if (document.fullscreenElement) {
    view.classList.add('is-fullscreen');
  } else {
    view.classList.remove('is-fullscreen');
  }
});

document.addEventListener('webkitfullscreenchange', () => {
  const view = document.getElementById('project-expanded-view');
  if (document.webkitFullscreenElement) {
    view.classList.add('is-fullscreen');
  } else {
    view.classList.remove('is-fullscreen');
  }
});

// ════════════════════════════════════════════════════════════
// IDLE TIMER & CENTER PULSE
// ════════════════════════════════════════════════════════════

function resetIdleTimer() {
  if (!expandedView || !expandedView.classList.contains('is-active')) return;
  expandedView.classList.remove('player-idle');
  clearTimeout(idleTimeout);
  idleTimeout = setTimeout(() => {
    if (isVideoPlaying && activeProject) {
      expandedView.classList.add('player-idle');
    }
  }, 3500);
}

function showCenterPulse(svgHtml) {
  const pulse = document.getElementById('player-center-state');
  if (!pulse) return;
  pulse.innerHTML = `<svg viewBox="0 0 24 24">${svgHtml}</svg>`;
  pulse.classList.remove('pulse');
  void pulse.offsetWidth;
  pulse.classList.add('pulse');
}

// ════════════════════════════════════════════════════════════
// SCROLL EFFECTS (Parallax & Stagger)
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  const localExpandedView = document.getElementById('project-expanded-view');
  if (localExpandedView) {
    localExpandedView.addEventListener('scroll', handleExpandedScroll, { passive: true });
  }

  // Handle orientation changes while a project is open
  const handleOrientationChange = () => {
    if (!activeProject) return;
    const customUI = document.getElementById('custom-player-ui');
    if (!customUI) return;
    
    const isLandscape = window.matchMedia('(orientation: landscape)').matches;
    const isNarrow = window.innerWidth <= 900 || window.innerHeight <= 500;
    
    if (isNarrow && !isLandscape) {
      // Portrait mobile — hide custom UI, use native YouTube controls
      customUI.style.display = 'none';
    } else {
      // Landscape or desktop — show custom UI
      customUI.style.display = '';
    }
  };

  window.addEventListener('orientationchange', () => {
    // Delay to let the browser finish rotating
    setTimeout(handleOrientationChange, 150);
  });
  window.addEventListener('resize', handleOrientationChange);
});

function handleExpandedScroll(e) {
  const view = e.currentTarget;
  if (!view.classList.contains('is-active')) return;
  
  // Disable scale and stagger on mobile so elements are native flow and visible.
  if (window.innerWidth <= 900) {
    const staggers = document.querySelectorAll('.glass-stagger');
    staggers.forEach(el => el.classList.add('glass-visible'));
    return;
  }
  
  const scrollY = view.scrollTop;
  
  // 1. Scale and fade media to fall into the background
  const innerMedia = document.getElementById('expanded-media-inner');
  if (innerMedia) {
    const scale = Math.max(0.75, 1 - scrollY * 0.0005);
    const opacity = Math.max(0.2, 1 - scrollY * 0.0015);
    innerMedia.style.transform = `scale(${scale})`;
    innerMedia.style.opacity = opacity;
  }
  
  // 2. Stagger text elements as they scroll into view
  const staggers = document.querySelectorAll('.glass-stagger');
  const triggerPoint = window.innerHeight * 0.95; 
  
  staggers.forEach((el, idx) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < triggerPoint) {
      if (!el.classList.contains('glass-visible')) {
        el.style.transitionDelay = `${idx * 0.12}s`;
        void el.offsetWidth;
        el.classList.add('glass-visible');
      }
    }
  });
}

// ════════════════════════════════════════════════════════════
// SWIPE-DOWN-TO-DISMISS — GSAP Draggable (YouTube-style)
// ════════════════════════════════════════════════════════════

(function initSwipeToDismiss() {
  // State
  let _dismissDragging = false;
  let _dragStartTime = 0;
  let _dragStartY = 0;

  const THRESHOLD = 0.20;       // 20% of viewport height = dismiss
  const VELOCITY_THRESH = 600;  // px/s fast-flick threshold

  // Expose drag state for play-toggle guard in main.js
  window._isDismissDragging = () => _dismissDragging;

  function isSkipTarget(el) {
    return el.closest('button') ||
           el.closest('iframe') ||
           el.closest('.player-timeline-wrapper') ||
           el.closest('.player-vol-slider-container') ||
           el.closest('input') ||
           el.closest('a');
  }

  document.addEventListener('DOMContentLoaded', () => {
    gsap.registerPlugin(Draggable);

    const view = document.getElementById('project-expanded-view');
    if (!view) return;

    Draggable.create(view, {
      type: 'y',
      lockAxis: true,
      zIndexBoost: false,
      allowEventDefault: true,    // don't eat scroll events

      // ── Press: gate the drag ──
      onPress: function (e) {
        // Bail if the view isn't open
        if (!view.classList.contains('is-active')) {
          this.endDrag(e);
          return;
        }
        // Don't hijack interactive children
        if (isSkipTarget(e.target)) {
          this.endDrag(e);
          return;
        }
        // Don't start a dismiss drag if user has scrolled down
        if (view.scrollTop > 5) {
          this.endDrag(e);
          return;
        }

        _dragStartTime = Date.now();
        _dragStartY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      },

      // ── Drag: live visual feedback ──
      onDrag: function () {
        const dy = this.y;

        // Only allow downward drag
        if (dy <= 0) {
          gsap.set(view, { y: 0 });
          return;
        }

        // Don't start visual dismiss if scrolled
        if (view.scrollTop > 5) {
          gsap.set(view, { y: 0 });
          this.endDrag();
          return;
        }

        _dismissDragging = true;

        const vh = window.innerHeight;
        const p = Math.min(dy / vh, 1); // 0..1 progress

        const scale  = 1 - p * 0.12;     // 1 → 0.88
        const opac   = 1 - p * 0.5;      // 1 → 0.5
        const radius = p * 24;           // 0 → 24px

        // Lock scroll so content doesn't shift while dragging
        view.style.overflow = 'hidden';

        gsap.set(view, {
          scaleX: scale,
          scaleY: scale,
          opacity: opac,
          borderRadius: radius + 'px'
        });

        // Backdrop: fade in proportionally
        const bd = document.getElementById('dismiss-backdrop');
        if (bd) {
          bd.classList.add('is-visible');
          bd.style.opacity = 0.6 * p;
        }

        // Fade close button as user drags
        const cb = document.getElementById('expanded-close-btn');
        if (cb) cb.style.opacity = Math.max(0, 1 - p * 2);
      },

      // ── Release: dismiss or snap back ──
      onDragEnd: function () {
        const dy = this.y;
        const dt = (Date.now() - _dragStartTime) / 1000 || 0.01;
        const vel = dy / dt;            // px/s
        const p = dy / window.innerHeight;

        // Only consider downward motion
        if (dy <= 0 || !_dismissDragging) {
          _snapBack(view);
          return;
        }

        if (p > THRESHOLD || vel > VELOCITY_THRESH) {
          _animateDismiss(view, dy);
        } else {
          _snapBack(view);
        }
      }
    });
  });

  // ── Animate dismiss (slide off + close) ──
  function _animateDismiss(view) {
    const vh = window.innerHeight;
    const bd = document.getElementById('dismiss-backdrop');
    const cb = document.getElementById('expanded-close-btn');

    gsap.to(view, {
      y: vh,
      scaleX: 0.85,
      scaleY: 0.85,
      opacity: 0,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => {
        // Reset GSAP props
        gsap.set(view, { clearProps: 'y,scaleX,scaleY,opacity,borderRadius' });
        view.style.overflow = '';

        if (bd) {
          bd.classList.remove('is-visible');
          bd.style.opacity = '';
        }
        if (cb) cb.style.opacity = '';

        _dismissDragging = false;
        closeProject();
      }
    });

    // Fade backdrop in parallel
    if (bd) {
      gsap.to(bd, { opacity: 0, duration: 0.3, ease: 'power2.in' });
    }
    if (cb) {
      gsap.to(cb, { opacity: 0, duration: 0.15 });
    }
  }

  // ── Snap back to fullscreen position ──
  function _snapBack(view) {
    const bd = document.getElementById('dismiss-backdrop');
    const cb = document.getElementById('expanded-close-btn');

    gsap.to(view, {
      y: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      borderRadius: '0px',
      duration: 0.4,
      ease: 'power3.out',
      onComplete: () => {
        gsap.set(view, { clearProps: 'y,scaleX,scaleY,opacity,borderRadius' });
        view.style.overflow = '';
        _dismissDragging = false;
      }
    });

    if (bd) {
      gsap.to(bd, {
        opacity: 0,
        duration: 0.35,
        ease: 'power2.out',
        onComplete: () => {
          bd.classList.remove('is-visible');
          bd.style.opacity = '';
        }
      });
    }

    if (cb) {
      gsap.to(cb, { opacity: 1, duration: 0.3 });
    }
  }
})();
