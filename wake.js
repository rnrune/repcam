// Keep the screen on during a workout: Screen Wake Lock API (iOS 16.4+), re-acquired on visibilitychange,
// with a NoSleep-style fallback (hidden, muted, looping inline video) for older iOS / when the request is refused.
(function (root) {
  function createWake(doc = document, nav = navigator) {
    let want = false, sentinel = null, video = null, mode = 'off';
    function fallback() {
      if (!video) {
        video = doc.createElement('video');
        video.setAttribute('playsinline', ''); video.setAttribute('muted', ''); video.muted = true; video.loop = true;
        video.setAttribute('title', 'RepCam'); video.src = 'nosleep.mp4';
        video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0';
        doc.body.appendChild(video);
      }
      const p = video.play(); mode = 'video';
      if (p && p.catch) p.catch(() => { mode = 'off'; });
    }
    async function acquire() {
      if (!want || doc.visibilityState !== 'visible') return mode;
      if (nav.wakeLock && nav.wakeLock.request) {
        if (sentinel && !sentinel.released) return mode;
        try {
          sentinel = await nav.wakeLock.request('screen'); mode = 'wakelock';
          sentinel.addEventListener && sentinel.addEventListener('release', () => { sentinel = null; if (want && doc.visibilityState === 'visible') acquire(); });
          if (video) video.pause();
          return mode;
        } catch (e) { /* refused (no gesture, low battery, standalone bug) → fallback */ }
      }
      fallback(); return mode;
    }
    function on() { want = true; return acquire(); }
    function off() { want = false; mode = 'off'; if (sentinel) { sentinel.release().catch(() => {}); sentinel = null; } if (video) video.pause(); }
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') acquire(); });
    // A tap anywhere re-arms it (needed for the video fallback and for wakeLock after iOS refused without activation).
    doc.addEventListener('click', () => { if (want && mode !== 'wakelock') acquire(); }, true);
    return { on, off, acquire, mode: () => mode, active: () => want };
  }
  root.Wake = { createWake };
})(this);
