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
  function deviceProfile() {
    var ua = UA || "";
    var model = "Fire TV";
    var m = ua.match(/(AFT[A-Z0-9]+)/);
    if (m) model = "Fire TV (" + m[1] + ")";
    else if (/Silk/i.test(ua)) model = "Fire TV (Silk)";
    return { model: model, lowPower: isLowPower(), ua: ua };
  }
  function systemTime() {
    try { return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
    catch (e) { return ""; }
  }
  function parseAlexaVoice(text) {
    var t = (text || "").toLowerCase();
    var out = { budgetMin: null, thread: null, mood: null, kidsOnly: false, afterSec: null, action: null };
    if (!t) return out;
    if (/pause|stop|halt/.test(t)) out.action = "pause";
    else if (/resume|continue|play/.test(t)) out.action = "play";
    else if (/next|forward|skip/.test(t)) out.action = "next";
    else if (/back|previous|rewind|replay/.test(t)) out.action = "prev";
    else if (/home|launcher/.test(t)) out.action = "home";
    var m = t.match(/(\d+)\s*(min|minute)/);
    if (m) out.budgetMin = parseInt(m[1], 10);
    if (/five|5/.test(t) && /essentials|quick|short/.test(t)) out.budgetMin = 5;
    if (/fifteen|15/.test(t)) out.budgetMin = 15;
    if (/thirty|30/.test(t)) out.budgetMin = 30;
    if (/full|whole|entire/.test(t)) out.budgetMin = 52;
    if (/mystery|detective|clue/.test(t)) out.thread = "mystery";
    else if (/romance|heart|love|family/.test(t)) out.thread = "heart";
    else if (/chase|action|storm/.test(t)) out.thread = "chase";
    if (/intense|exciting|tense/.test(t)) out.mood = "intense";
    if (/kids|family-safe|calm|gentle/.test(t)) out.kidsOnly = true;
    var tm = t.match(/(\d+):(\d+)/);
    if (tm && /stopped|left|from|catch/.test(t)) out.afterSec = parseInt(tm[1], 10) * 60 + parseInt(tm[2], 10);
    return out;
  }
  function recentsKey() { return "cutline:firetv:recents:v1"; }
  function getRecents() {
    try { return JSON.parse(localStorage.getItem(recentsKey()) || "[]"); }
    catch (e) { return []; }
  }
  function pushRecent(item) {
    try {
      var r = getRecents();
      r = r.filter(function (x) { return x && x.label !== item.label; });
      r.unshift({ label: item.label, dur: item.dur, at: Date.now() });
      localStorage.setItem(recentsKey(), JSON.stringify(r.slice(0, 6)));
      return r.slice(0, 6);
    } catch (e) { return []; }
  }
  function pinGet() {
    try { return localStorage.getItem("cutline:firetv:pin:v1") || "1111"; }
    catch (e) { return "1111"; }
  }
  function pinCheck(pin) { return String(pin) === String(pinGet()); }
  function pinSet(pin) {
    try { localStorage.setItem("cutline:firetv:pin:v1", String(pin)); } catch (e) {}
  }
  function prefGet(k, fb) { try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } }
  function prefSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function getAutoplay() { return !!prefGet("cutline:firetv:autoplay:v1", false); }
  function setAutoplay(v) { prefSet("cutline:firetv:autoplay:v1", !!v); }
  function getRecap() { var v = prefGet("cutline:firetv:recap:v1", true); return v !== false; }
  function setRecap(v) { prefSet("cutline:firetv:recap:v1", !!v); }
  function parseSleepMinutes(text) {
    var m = String(text || "").match(/(\d+)\s*(min|minute)/);
    return m ? Math.max(1, Math.min(120, parseInt(m[1], 10))) : 0;
  }
  function bindMediaKeys(handlers) {
    try {
      if (!("mediaSession" in navigator)) return;
      handlers = handlers || {};
      ["play", "pause", "previoustrack", "nexttrack"].forEach(function (a) {
        try { navigator.mediaSession.setActionHandler(a, handlers[a] || null); } catch (e) {}
      });
    } catch (e) {}
  }
  return { isFireTV: isFireTV, isLowPower: isLowPower, applyPlatformClass: applyPlatformClass, keepAwake: keepAwake, setMediaSession: setMediaSession, parseAlexaIntent: parseAlexaIntent, networkKind: networkKind, deviceProfile: deviceProfile, systemTime: systemTime, parseAlexaVoice: parseAlexaVoice, getRecents: getRecents, pushRecent: pushRecent, pinGet: pinGet, pinCheck: pinCheck, pinSet: pinSet, bindMediaKeys: bindMediaKeys, getAutoplay: getAutoplay, setAutoplay: setAutoplay, getRecap: getRecap, setRecap: setRecap, parseSleepMinutes: parseSleepMinutes };
});
