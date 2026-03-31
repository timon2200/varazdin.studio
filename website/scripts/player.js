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
  let dragStartY = 0;
  let dragStartX = 0;
  let dragCurrentY = 0;
  let dragStartTime = 0;
  let isDismissDragging = false;
  let directionLocked = false;  // once we decide horizontal vs vertical, lock it
  let isVerticalDrag = false;

  const DISMISS_THRESHOLD = 0.25;  // 25% of viewport height
  const VELOCITY_THRESHOLD = 800;  // px/s — fast flick = instant dismiss
  const LOCK_DISTANCE = 10;        // px before we lock direction

  function getExpandedView() {
    return document.getElementById('project-expanded-view');
  }

  function shouldIgnoreTarget(target) {
    // Don't interfere with interactive elements, iframes, scrubber, sliders
    return target.closest('button') ||
           target.closest('iframe') ||
           target.closest('.player-timeline-wrapper') ||
           target.closest('.player-vol-slider-container') ||
           target.closest('input') ||
           target.closest('a');
  }

  function applyDragTransform(deltaY) {
    const view = getExpandedView();
    if (!view) return;

    // Only allow dragging downward (deltaY > 0)
    const clampedDelta = Math.max(0, deltaY);
    const vh = window.innerHeight;
    const progress = Math.min(clampedDelta / vh, 1);

    // Scale: 1 → 0.85 as you drag down
    const scale = 1 - progress * 0.15;
    // Opacity: 1 → 0.4
    const opacity = 1 - progress * 0.6;
    // Border radius grows as it shrinks (like iOS app switcher)
    const radius = progress * 24;

    view.style.transition = 'none';
    view.style.transform = `translateY(${clampedDelta}px) scale(${scale})`;
    view.style.opacity = opacity;
    view.style.borderRadius = `${radius}px`;
  }

  function resetDragTransform(animate) {
    const view = getExpandedView();
    if (!view) return;

    if (animate) {
      view.style.transition = 'transform 0.35s cubic-bezier(0.2, 1, 0.3, 1), opacity 0.35s ease, border-radius 0.35s ease';
    }
    view.style.transform = '';
    view.style.opacity = '';
    view.style.borderRadius = '';

    if (animate) {
      setTimeout(() => {
        view.style.transition = '';
      }, 350);
    }
  }

  function dismissWithAnimation() {
    const view = getExpandedView();
    if (!view) return;

    const vh = window.innerHeight;
    view.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 1, 1), opacity 0.3s ease';
    view.style.transform = `translateY(${vh}px) scale(0.8)`;
    view.style.opacity = '0';

    setTimeout(() => {
      view.style.transition = '';
      view.style.transform = '';
      view.style.opacity = '';
      view.style.borderRadius = '';
      closeProject();
    }, 350);
  }

  // ── Touch Events ──

  function onTouchStart(e) {
    const view = getExpandedView();
    if (!view || !view.classList.contains('is-active')) return;
    if (shouldIgnoreTarget(e.target)) return;

    // On mobile portrait, only allow dismiss drag on the media layer area (top portion)
    // On desktop/landscape, allow anywhere
    const touch = e.touches[0];
    dragStartY = touch.clientY;
    dragStartX = touch.clientX;
    dragCurrentY = touch.clientY;
    dragStartTime = Date.now();
    isDismissDragging = false;
    directionLocked = false;
    isVerticalDrag = false;
  }

  function onTouchMove(e) {
    const view = getExpandedView();
    if (!view || !view.classList.contains('is-active')) return;
    if (dragStartY === 0) return;

    const touch = e.touches[0];
    const deltaY = touch.clientY - dragStartY;
    const deltaX = touch.clientX - dragStartX;

    // Direction lock: once we move enough, decide if this is a vertical or horizontal gesture
    if (!directionLocked) {
      const absDeltaY = Math.abs(deltaY);
      const absDeltaX = Math.abs(deltaX);
      const totalDelta = Math.sqrt(absDeltaY * absDeltaY + absDeltaX * absDeltaX);

      if (totalDelta > LOCK_DISTANCE) {
        directionLocked = true;
        isVerticalDrag = absDeltaY > absDeltaX;
      }

      if (!directionLocked) return;
    }

    // If horizontal, ignore
    if (!isVerticalDrag) return;

    // Only care about downward drags
    if (deltaY <= 0) {
      if (isDismissDragging) {
        resetDragTransform(false);
        isDismissDragging = false;
      }
      return;
    }

    // On mobile portrait, check if the user is scrolling the glass layer content
    // If the expanded view has scroll and scrollTop > 0, don't dismiss
    if (view.scrollTop > 5) return;

    isDismissDragging = true;
    dragCurrentY = touch.clientY;
    e.preventDefault();  // prevent scroll
    applyDragTransform(deltaY);
  }

  function onTouchEnd(e) {
    if (!isDismissDragging) {
      dragStartY = 0;
      return;
    }

    const deltaY = dragCurrentY - dragStartY;
    const elapsed = (Date.now() - dragStartTime) / 1000; // seconds
    const velocity = deltaY / elapsed;  // px/s
    const vh = window.innerHeight;
    const progress = deltaY / vh;

    if (progress > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      dismissWithAnimation();
    } else {
      resetDragTransform(true);
    }

    isDismissDragging = false;
    directionLocked = false;
    isVerticalDrag = false;
    dragStartY = 0;
  }

  // ── Mouse Events (desktop) ──

  let isMouseDragging = false;

  function onMouseDown(e) {
    const view = getExpandedView();
    if (!view || !view.classList.contains('is-active')) return;
    if (shouldIgnoreTarget(e.target)) return;
    if (e.button !== 0) return;  // left click only

    dragStartY = e.clientY;
    dragStartX = e.clientX;
    dragCurrentY = e.clientY;
    dragStartTime = Date.now();
    isMouseDragging = false;
    isDismissDragging = false;
    directionLocked = false;
    isVerticalDrag = false;
  }

  function onMouseMove(e) {
    if (dragStartY === 0) return;

    const deltaY = e.clientY - dragStartY;
    const deltaX = e.clientX - dragStartX;

    if (!directionLocked) {
      const totalDelta = Math.sqrt(deltaY * deltaY + deltaX * deltaX);
      if (totalDelta > LOCK_DISTANCE) {
        directionLocked = true;
        isVerticalDrag = Math.abs(deltaY) > Math.abs(deltaX);
      }
      if (!directionLocked) return;
    }

    if (!isVerticalDrag) return;
    if (deltaY <= 0) {
      if (isDismissDragging) {
        resetDragTransform(false);
        isDismissDragging = false;
      }
      return;
    }

    const view = getExpandedView();
    if (view && view.scrollTop > 5) return;

    isDismissDragging = true;
    isMouseDragging = true;
    dragCurrentY = e.clientY;
    e.preventDefault();
    applyDragTransform(deltaY);
  }

  function onMouseUp(e) {
    if (!isDismissDragging) {
      dragStartY = 0;
      return;
    }

    const deltaY = dragCurrentY - dragStartY;
    const elapsed = (Date.now() - dragStartTime) / 1000;
    const velocity = deltaY / elapsed;
    const vh = window.innerHeight;
    const progress = deltaY / vh;

    if (progress > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      dismissWithAnimation();
    } else {
      resetDragTransform(true);
    }

    isDismissDragging = false;
    isMouseDragging = false;
    directionLocked = false;
    isVerticalDrag = false;
    dragStartY = 0;
  }

  // ── Bind Events ──

  document.addEventListener('DOMContentLoaded', () => {
    const view = document.getElementById('project-expanded-view');
    if (!view) return;

    // Touch
    view.addEventListener('touchstart', onTouchStart, { passive: true });
    view.addEventListener('touchmove', onTouchMove, { passive: false });
    view.addEventListener('touchend', onTouchEnd, { passive: true });
    view.addEventListener('touchcancel', onTouchEnd, { passive: true });

    // Mouse
    view.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Expose a way to check if dismiss drag is active (to prevent togglePlay on click)
  window._isDismissDragging = () => isMouseDragging || isDismissDragging;
})();
