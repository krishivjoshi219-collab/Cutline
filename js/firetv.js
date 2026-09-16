(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CutlineFireTV = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var UA = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  function isFireTV() {
    return /AFT|AFTM|AFTT|Fire TV|Fire OS|KFSUWI|Silk-Accelerated/i.test(UA);
  }
  function isLowPower() {
    return isFireTV() || /Stick Lite|AFTMM|AFTSS/i.test(UA);
  }
  function applyPlatformClass() {
    try { if (isFireTV() && document.body) document.body.classList.add("firetv"); } catch (e) {}
    try {
      var q = {};
      (location.search || "").replace(/^\?/, "").split("&").forEach(function (p) {
        var kv = p.split("="); if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
      });
      if (q.motion === "reduced" && document.body) document.body.classList.add("reduce-motion");
    } catch (e) {}
  }
  var wakeLock = null;
  function keepAwake(on) {
    if (on === false) {
      try { if (wakeLock && wakeLock.release) wakeLock.release(); } catch (e) {}
      wakeLock = null; return;
    }
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; }).catch(function () {});
      }
    } catch (e) {}
    try {
      var v = document.querySelector("video");
      if (v) { v.setAttribute("x-webkit-airplay", "allow"); }
    } catch (e) {}
  }
  function setMediaSession(title, artist) {
    try {
      if (!("mediaSession" in navigator)) return;
      navigator.mediaSession.metadata = new MediaMetadata({ title: title || "Cutline cut", artist: artist || "Harbor Lights S01E07", album: "CUTLINE" });
    } catch (e) {}
  }
  function parseAlexaIntent() {
    try {
      var q = {};
      (location.search || "").replace(/^\?/, "").split("&").forEach(function (p) {
        var kv = p.split("="); if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
      });
      var h = location.hash || "";
      return { autoplay: q.autoplay || null, thread: q.thread || null, mood: q.mood || null, budget: q.budget || null, voice: q.voice || q.alexa || null, rawHash: h };
    } catch (e) { return {}; }
  }
  function networkKind() {
    try {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!c) return "unknown";
      return (c.effectiveType || c.type || "unknown") + (c.saveData ? " · save-data" : "");
    } catch (e) { return "unknown"; }
  }
  return { isFireTV: isFireTV, isLowPower: isLowPower, applyPlatformClass: applyPlatformClass, keepAwake: keepAwake, setMediaSession: setMediaSession, parseAlexaIntent: parseAlexaIntent, networkKind: networkKind };
});
