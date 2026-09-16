(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CutlineOTT = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var PROVIDERS = [
    { id: "prime", name: "Prime Video", short: "P", color: "#00a8e1", web: "https://app.primevideo.com", intent: "amzn://apps/android?p=com.amazon.avod", pkg: "com.amazon.avod" },
    { id: "netflix", name: "Netflix", short: "N", color: "#e50914", web: "https://www.netflix.com", intent: "amzn://apps/android?p=com.netflix.ninja", pkg: "com.netflix.ninja" },
    { id: "disney", name: "Disney+", short: "D+", color: "#113ccf", web: "https://www.disneyplus.com", intent: "amzn://apps/android?p=com.disney.disneyplus", pkg: "com.disney.disneyplus" },
    { id: "max", name: "Max", short: "M", color: "#7b2ff7", web: "https://play.max.com", intent: "amzn://apps/android?p=com.wbd.stream", pkg: "com.wbd.stream" },
    { id: "hulu", name: "Hulu", short: "H", color: "#1ce783", web: "https://www.hulu.com", intent: "amzn://apps/android?p=com.hulu.plus", pkg: "com.hulu.plus" },
    { id: "apple", name: "Apple TV+", short: "", color: "#a3a3a3", web: "https://tv.apple.com", intent: "amzn://apps/android?p=com.apple.atve.amazon.appletv", pkg: "com.apple.atve.amazon.appletv" },
    { id: "paramount", name: "Paramount+", short: "P+", color: "#0064ff", web: "https://www.paramountplus.com", intent: "amzn://apps/android?p=com.cbs.app", pkg: "com.cbs.app" },
    { id: "peacock", name: "Peacock", short: "Pk", color: "#fccc12", web: "https://www.peacocktv.com", intent: "amzn://apps/android?p=com.peacocktv.peacockfiretv", pkg: "com.peacocktv.peacockfiretv" }
  ];
  var CATALOG = [
    { title: "Harbor Lights S01E07", providers: ["prime", "apple"], dur: "52:14", note: "Cutline demo episode" },
    { title: "Harbor Lights S01 Full Season", providers: ["prime", "hulu"], dur: "6h 10m", note: "Binge as 90-min cut" },
    { title: "Mystery Picks: Harbor Docs", providers: ["netflix", "max"], dur: "1h 40m", note: "Pairs with mystery lens" },
    { title: "Heart Picks: Family Harbor", providers: ["disney", "apple"], dur: "44m", note: "Kids-safe route ready" }
  ];
  function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function getConnected() { return lsGet("cutline:ott:v1", ["prime"]); }
  function setConnected(ids) { lsSet("cutline:ott:v1", ids); }
  function byId(id) { return PROVIDERS.filter(function (p) { return p.id === id; })[0] || null; }
  function deepLink(providerId, title) {
    var p = byId(providerId);
    if (!p) return null;
    var q = title ? "?search=" + encodeURIComponent(title) : "";
    var isFire = /AFT|Fire TV|Fire OS/i.test(navigator.userAgent || "");
    return { web: p.web + (title ? "/search?q=" + encodeURIComponent(title) : ""), app: p.intent + q, pkg: p.pkg, name: p.name };
  }
  function tryOpen(providerId, title) {
    var l = deepLink(providerId, title);
    if (!l) return null;
    try {
      var a = document.createElement("a");
      a.href = l.app; a.style.display = "none";
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { a.remove(); } catch (e) {} }, 800);
    } catch (e) {}
    return l;
  }
  function searchCatalog(query) {
    var q = (query || "").toLowerCase().trim();
    if (!q) return CATALOG.slice();
    return CATALOG.filter(function (c) {
      return c.title.toLowerCase().indexOf(q) !== -1 || c.note.toLowerCase().indexOf(q) !== -1 || q.split(/\s+/).some(function (w) { return w && c.title.toLowerCase().indexOf(w) !== -1; });
    });
  }
  function watchlistKey() { return "cutline:ott:watchlist:v1"; }
  function getWatchlist() { try { return JSON.parse(localStorage.getItem(watchlistKey()) || "[]"); } catch (e) { return []; } }
  function toggleWatch(title) {
    var w = getWatchlist();
    var i = w.indexOf(title);
    if (i === -1) w.unshift(title); else w.splice(i, 1);
    try { localStorage.setItem(watchlistKey(), JSON.stringify(w.slice(0, 20))); } catch (e) {}
    return getWatchlist();
  }
  function isInWatchlist(title) { return getWatchlist().indexOf(title) !== -1; }
  function getBinge() {
    return [
      { title: "Harbor Lights S01E08", dur: "51:40", note: "auto-cut ready · same 15-min shape" },
      { title: "Harbor Lights S01E09 (finale)", dur: "58:02", note: "payoff-heavy · spoiler-guarded" }
    ];
  }
  return { PROVIDERS: PROVIDERS, CATALOG: CATALOG, getConnected: getConnected, setConnected: setConnected, byId: byId, deepLink: deepLink, tryOpen: tryOpen, searchCatalog: searchCatalog, getWatchlist: getWatchlist, toggleWatch: toggleWatch, isInWatchlist: isInWatchlist, getBinge: getBinge };
});
