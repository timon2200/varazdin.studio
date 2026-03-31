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
  if (closeBtn) closeBtn.classList.remove('is-visible');

  // Hide dismiss backdrop
  const backdrop = document.getElementById('dismiss-backdrop');
  if (backdrop) {
    backdrop.classList.remove('is-visible');
    backdrop.style.opacity = '';
  }

  // Clear any leftover drag transforms
  expandedView.style.transform = '';
  expandedView.style.opacity = '';
  expandedView.style.borderRadius = '';
  expandedView.style.transition = '';
  expandedView.style.overflow = '';
  
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
// SWIPE-DOWN-TO-DISMISS (YouTube-style)
// ════════════════════════════════════════════════════════════

(function initSwipeToDismiss() {
  let startY = 0;
  let startX = 0;
  let currentY = 0;
  let startTime = 0;
  let dragging = false;
  let locked = false;
  let vertical = false;
  let wasMouseDrag = false;

  const THRESHOLD = 0.20;       // 20% of viewport = dismiss
  const VELOCITY_THRESH = 600;  // px/s fast flick
  const LOCK_PX = 12;           // px before direction lock

  function getView() {
    return document.getElementById('project-expanded-view');
  }

  function skipTarget(t) {
    // Never interfere with buttons, iframes, inputs, links, scrubber, volume
    return t.closest('button') ||
           t.closest('iframe') ||
           t.closest('.player-timeline-wrapper') ||
           t.closest('.player-vol-slider-container') ||
           t.closest('input') ||
           t.closest('a');
  }

  // ── Visual feedback ──

  function applyDrag(dy) {
    const view = getView();
    if (!view) return;

    const clamped = Math.max(0, dy);
    const vh = window.innerHeight;
    const p = Math.min(clamped / vh, 1); // 0..1 progress

    const scale = 1 - p * 0.12;
    const opacity = 1 - p * 0.5;
    const radius = p * 20;

    // Lock scroll during drag so content doesn't shift
    view.style.overflow = 'hidden';
    view.style.transition = 'none';
    view.style.transform = `translateY(${clamped}px) scale(${scale})`;
    view.style.opacity = opacity;
    view.style.borderRadius = `${radius}px`;

    // Backdrop: fade in as user drags
    const bd = document.getElementById('dismiss-backdrop');
    if (bd) {
      bd.classList.add('is-visible');
      bd.style.opacity = 0.6 * p;  // 0 → 0.6
    }

    // Sync close button opacity down
    const cb = document.getElementById('expanded-close-btn');
    if (cb) cb.style.opacity = Math.max(0, 1 - p * 2);
  }

  function snapBack() {
    const view = getView();
    if (!view) return;

    view.style.transition = 'transform 0.35s cubic-bezier(0.2,1,0.3,1), opacity 0.35s ease, border-radius 0.35s ease';
    view.style.transform = '';
    view.style.opacity = '';
    view.style.borderRadius = '';

    const bd = document.getElementById('dismiss-backdrop');
    if (bd) {
      bd.style.transition = 'opacity 0.35s ease';
      bd.style.opacity = '0';
    }

    const cb = document.getElementById('expanded-close-btn');
    if (cb) cb.style.opacity = '';

    setTimeout(() => {
      if (view) {
        view.style.transition = '';
        view.style.overflow = '';
      }
      if (bd) {
        bd.classList.remove('is-visible');
        bd.style.transition = '';
        bd.style.opacity = '';
      }
    }, 380);
  }

  function animateDismiss() {
    const view = getView();
    if (!view) return;

    const vh = window.innerHeight;
    view.style.transition = 'transform 0.3s cubic-bezier(0.4,0,1,1), opacity 0.25s ease';
    view.style.transform = `translateY(${vh}px) scale(0.85)`;
    view.style.opacity = '0';

    const bd = document.getElementById('dismiss-backdrop');
    if (bd) {
      bd.style.transition = 'opacity 0.3s ease';
      bd.style.opacity = '0';
    }

    const cb = document.getElementById('expanded-close-btn');
    if (cb) cb.style.opacity = '0';

    setTimeout(() => {
      // Clean up all inline styles before closeProject resets
      view.style.transition = '';
      view.style.transform = '';
      view.style.opacity = '';
      view.style.borderRadius = '';
      view.style.overflow = '';
      if (bd) {
        bd.classList.remove('is-visible');
        bd.style.transition = '';
        bd.style.opacity = '';
      }
      if (cb) cb.style.opacity = '';
      closeProject();
    }, 320);
  }

  function finishDrag() {
    const dy = currentY - startY;
    const dt = (Date.now() - startTime) / 1000 || 0.01;
    const vel = dy / dt;
    const p = dy / window.innerHeight;

    if (p > THRESHOLD || vel > VELOCITY_THRESH) {
      animateDismiss();
    } else {
      snapBack();
    }
  }

  // ── TOUCH ──

  function onTS(e) {
    const view = getView();
    if (!view || !view.classList.contains('is-active')) return;
    if (skipTarget(e.target)) return;

    const t = e.touches[0];
    startY = t.clientY;
    startX = t.clientX;
    currentY = t.clientY;
    startTime = Date.now();
    dragging = false;
    locked = false;
    vertical = false;
  }

  function onTM(e) {
    const view = getView();
    if (!view || !view.classList.contains('is-active')) return;
    if (startY === 0) return;

    const t = e.touches[0];
    const dy = t.clientY - startY;
    const dx = t.clientX - startX;

    // Direction lock
    if (!locked) {
      if (Math.sqrt(dy * dy + dx * dx) > LOCK_PX) {
        locked = true;
        vertical = Math.abs(dy) > Math.abs(dx);
      } else {
        return;
      }
    }

    if (!vertical || dy <= 0) {
      if (dragging) { snapBack(); dragging = false; }
      return;
    }

    // Only dismiss if scrolled to the top
    if (view.scrollTop > 5) return;

    dragging = true;
    currentY = t.clientY;
    e.preventDefault();
    applyDrag(dy);
  }

  function onTE() {
    if (!dragging) { startY = 0; return; }
    finishDrag();
    dragging = false; locked = false; vertical = false; startY = 0;
  }

  // ── MOUSE (desktop) ──

  function onMD(e) {
    const view = getView();
    if (!view || !view.classList.contains('is-active')) return;
    if (skipTarget(e.target)) return;
    if (e.button !== 0) return;

    startY = e.clientY;
    startX = e.clientX;
    currentY = e.clientY;
    startTime = Date.now();
    dragging = false; wasMouseDrag = false;
    locked = false; vertical = false;
  }

  function onMM(e) {
    if (startY === 0) return;

    const dy = e.clientY - startY;
    const dx = e.clientX - startX;

    if (!locked) {
      if (Math.sqrt(dy * dy + dx * dx) > LOCK_PX) {
        locked = true;
        vertical = Math.abs(dy) > Math.abs(dx);
      } else { return; }
    }

    if (!vertical || dy <= 0) {
      if (dragging) { snapBack(); dragging = false; wasMouseDrag = false; }
      return;
    }

    const view = getView();
    if (view && view.scrollTop > 5) return;

    dragging = true; wasMouseDrag = true;
    currentY = e.clientY;
    e.preventDefault();
    applyDrag(dy);
  }

  function onMU() {
    if (!dragging) { startY = 0; return; }
    finishDrag();
    dragging = false; wasMouseDrag = false;
    locked = false; vertical = false; startY = 0;
  }

  // ── Bind ──

  document.addEventListener('DOMContentLoaded', () => {
    const view = document.getElementById('project-expanded-view');
    if (!view) return;

    view.addEventListener('touchstart', onTS, { passive: true });
    view.addEventListener('touchmove', onTM, { passive: false });
    view.addEventListener('touchend', onTE, { passive: true });
    view.addEventListener('touchcancel', onTE, { passive: true });

    view.addEventListener('mousedown', onMD);
    document.addEventListener('mousemove', onMM);
    document.addEventListener('mouseup', onMU);
  });

  window._isDismissDragging = () => dragging || wasMouseDrag;
})();
