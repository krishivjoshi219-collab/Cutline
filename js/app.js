/* CUTLINE app — 10-foot Fire TV UX: budget select, live route preview, playback. */
(function () {
  "use strict";
  window.addEventListener("error", function (e) {
    try { console.error("[cutline]", e.message); } catch (err) {}
  });
  var S = window.CutlineSolver;
  var EP = window.EPISODE;
  var FTV = window.CutlineFireTV || null;
  var OTT = window.CutlineOTT || null;
  if (FTV) { try { FTV.applyPlatformClass(); } catch (e) {} }
  var IS_FIRETV = FTV ? FTV.isFireTV() : /AFT|AFTM|AFTT|Fire TV|Fire OS|KFSUWI|Silk-Accelerated/i.test(navigator.userAgent || "");
  try { if (IS_FIRETV) document.body.classList.add("firetv"); } catch (e) {}
  if (FTV && FTV.isLowPower()) { try { document.body.classList.add("reduce-motion"); } catch (e) {} }
  function getQuery() { var q = {}; try { (location.search || "").replace(/^\?/, "").split("&").forEach(function (p) { var kv = p.split("="); if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ""); }); } catch (e) {} return q; }

  var state = {
    budget: 900,            // seconds, or "full"
    thread: "all",
    intense: false,
    kidsOnly: false,
    afterSec: null,         // re-entry stop point
    excluded: {},           // sceneId -> true (heatmap toggles)
    spoiler: true,          // spoiler guard on by default
    route: null
  };
  function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function getHist() { return lsGet("cutline:history:v2", []); }
  function pushHist() {
    if (!state.route || !state.route.scenes.length) return;
    var h = getHist();
    h.unshift({ t: Date.now(), label: routeLabel(), dur: state.route.totalDuration, n: state.route.scenes.length, budget: state.budget, thread: state.thread, intense: state.intense, kidsOnly: state.kidsOnly, ids: state.route.ids.slice(0, 24) });
    lsSet("cutline:history:v2", h.slice(0, 8));
    renderLauncher();
  }
  function encodeCut() {
    var p = { b: state.budget, t: state.thread, i: state.intense ? 1 : 0, k: state.kidsOnly ? 1 : 0, a: state.afterSec, x: Object.keys(state.excluded).filter(function (k) { return state.excluded[k]; }) };
    return "#c=" + btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/=+$/, "");
  }
  function decodeCut() {
    try {
      if (!location.hash || location.hash.indexOf("#c=") !== 0) return null;
      return JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(3)))));
    } catch (e) { return null; }
  }

  function $(id) { return document.getElementById(id); }
  function fmtSaved(sec) {
    var m = Math.round(sec / 60);
    return m <= 0 ? "0 min saved" : m + " min saved";
  }
  function updateSavedBadges() {
    if (!state.route) return;
    var saved = Math.max(0, EP.durationSec - state.route.totalDuration);
    var txt = "✓ " + fmtSaved(saved) + " · " + state.route.scenes.length + " scenes";
    var b = $("savedBadge"); if (b) b.textContent = txt;
    var h = $("savedBadgeHero"); if (h) h.textContent = fmtSaved(saved);
    var st = $("stickyText"); if (st) st.textContent = routeLabel() + " ready · " + fmtSaved(saved);
    var sticky = $("stickyPlay");
    if (sticky) sticky.hidden = !$("screen-choose") || $("screen-choose").hidden;
  }
  function budgetSec() {
    return state.budget === "full" ? EP.durationSec : state.budget;
  }
  function opts() {
    return {
      thread: state.thread,
      mood: state.intense ? "intense" : null,
      kidsOnly: state.kidsOnly,
      afterSec: state.afterSec,
      excludeIds: Object.keys(state.excluded).filter(function (k) { return state.excluded[k]; })
    };
  }

  function routeLabel() {
    if (state.afterSec != null) return S.fmt(budgetSec()) + " CATCH-UP";
    if (state.budget === "full") return "FULL EPISODE";
    var m = Math.round(budgetSec() / 60);
    if (m === 5) return "5:00 ESSENTIALS";
    if (m === 15) return "15:00 STORY ROUTE";
    if (m === 30) return "30:00 CUT";
    return m + ":00 CUSTOM CUT";
  }

  function rebuild() {
    var b = budgetSec();
    if (state.budget === "full") {
      state.route = {
        scenes: SCENES.slice(), ids: SCENES.map(function (s) { return s.id; }),
        totalDuration: EP.durationSec, totalScore: 0, budgetSec: b,
        coverage: 1, bridgeId: null
      };
    } else {
      state.route = S.buildRoute(SCENES, b, opts());
    }
    renderPreview();
  }

  function impDots(imp) {
    var n = Math.max(1, Math.min(5, Math.round((isFinite(imp) ? imp : 0) * 5)));
    var s = "", i;
    for (i = 0; i < n; i++) s += "●";
    for (i = n; i < 5; i++) s += "○";
    return s;
  }

  function renderPreview() {
    var r = state.route;
    if (!r) return;
    var list = $("routeList");
    if (list) list.setAttribute("aria-busy", "true");
    $("routeTitle").textContent = routeLabel();
    $("heroBudget").textContent = state.afterSec != null
      ? Math.round(budgetSec() / 60) + " catch-up minutes"
      : (state.budget === "full" ? "the whole 52 minutes" : Math.round(budgetSec() / 60) + " minutes");
    $("routeTotal").textContent = S.fmt(r.totalDuration) + " / " + S.fmt(r.budgetSec) + " · " + r.scenes.length + " scenes";
    $("coverageBar").style.width = Math.min(100, r.coverage * 100).toFixed(1) + "%";
    $("coverageText").textContent = Math.round(r.coverage * 100) + "% of episode kept";
    $("morphVal").textContent = S.fmt(budgetSec());
    updateSavedBadges();

    // List with visible jumps between non-adjacent scenes.
    var ul = $("routeList"); ul.innerHTML = "";
    if (!r.scenes.length) {
      var d = document.createElement("div"); d.className = "empty";
      d.textContent = "No scenes fit these filters. Widen the thread or budget.";
      ul.appendChild(d);
    }
    var prev = null;
    r.scenes.forEach(function (sc) {
      if (prev && sc.start > prev.end) {
        var gap = document.createElement("li");
        gap.innerHTML = '<span></span><span class="jump">✂ jump +' + S.fmt(sc.start - prev.end) + " skipped — story holds</span><span></span>";
        ul.appendChild(gap);
      }
      var li = document.createElement("li");
      li.innerHTML = "<span class='rng'>" + S.fmtRange(sc) + "</span>" +
        "<span><span class='ttl'>" + escapeHtml(sc.title) + "</span><br>" +
        "<span class='meta'>" + S.fmt(sc.end - sc.start) + " · " + escapeHtml(sc.threads.join(" / ")) + " · " + escapeHtml(sc.plot.join(", ")) + " · " + escapeHtml(sc.synopsis) + "</span></span>" +
        "<span class='imp' title='narrative importance " + sc.importance + "'>" + impDots(sc.importance) + "</span>";
      ul.appendChild(li);
      prev = sc;
    });

    // Heatmap: every episode scene, kept / skipped / bridge.
    var kept = {}; r.scenes.forEach(function (s) { kept[s.id] = true; });
    var hm = $("heatmap"); hm.innerHTML = "";
    SCENES.forEach(function (sc) {
      var b = document.createElement("button");
      b.className = "blk focusable " + (sc.id === r.bridgeId ? "bridge" : (kept[sc.id] ? "kept" : "skip"));
      b.style.flexGrow = String(sc.end - sc.start);
      b.style.height = Math.round(24 + sc.importance * 34) + "px";
      b.title = S.fmtRange(sc) + " · " + sc.title + " · importance " + sc.importance +
        (kept[sc.id] ? " · kept (click to force out)" : " · skipped (click to force in)");
      b.setAttribute("aria-label", b.title);
      b.addEventListener("click", function () {
        if (kept[sc.id]) state.excluded[sc.id] = true;
        else delete state.excluded[sc.id];
        rebuild();
      });
      hm.appendChild(b);
    });
    refreshFocusables();
    try {
      localStorage.setItem("cutline:v1", JSON.stringify({ budget: state.budget, thread: state.thread, intense: state.intense, kidsOnly: state.kidsOnly }));
    } catch (e) {}
    if (list) list.setAttribute("aria-busy", "false");
  }

  var HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return HTML_ESCAPES[c]; });
  }

  /* ---------- controls ---------- */
  function clearReentry() { state.afterSec = null; }

  $("budgetCards").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-budget]"); if (!btn) return;
    clearReentry();
    state.budget = btn.dataset.budget === "full" ? "full" : parseInt(btn.dataset.budget, 10);
    syncBudgetUI(); rebuild();
  });

  function syncBudgetUI() {
    document.querySelectorAll("#budgetCards .watch-card").forEach(function (c) {
      var v = c.dataset.budget === "full" ? "full" : parseInt(c.dataset.budget, 10);
      c.setAttribute("aria-pressed", v === state.budget ? "true" : "false");
    });
    if (state.budget !== "full") $("morph").value = Math.round(state.budget / 60);
  }

  var morphT = null;
  $("morph").addEventListener("input", function (e) {
    clearReentry();
    state.budget = parseInt(e.target.value, 10) * 60;
    syncBudgetUI();
    if (morphT) clearTimeout(morphT);
    morphT = setTimeout(rebuild, 60);
  });

  $("threadRow").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-thread]"); if (!btn) return;
    clearReentry();
    state.thread = btn.dataset.thread;
    document.querySelectorAll("#threadRow .pill").forEach(function (p) {
      p.setAttribute("aria-pressed", p === btn ? "true" : "false");
    });
    rebuild();
  });

  $("moodBtn").addEventListener("click", function () {
    clearReentry();
    state.intense = !state.intense;
    $("moodBtn").setAttribute("aria-pressed", String(state.intense));
    $("moodBtn").textContent = "INTENSE: " + (state.intense ? "on" : "off");
    rebuild();
  });
  $("kidsBtn").addEventListener("click", function () {
    clearReentry();
    state.kidsOnly = !state.kidsOnly;
    $("kidsBtn").setAttribute("aria-pressed", String(state.kidsOnly));
    $("kidsBtn").textContent = "KIDS-SAFE: " + (state.kidsOnly ? "on" : "off");
    rebuild();
  });

  function applyNL(text) {
    var p = S.parseRequest(text);
    if (p.budgetMin != null) state.budget = Math.min(45, Math.max(1, p.budgetMin)) * 60;
    if (p.thread) {
      state.thread = p.thread;
      document.querySelectorAll("#threadRow .pill").forEach(function (el) {
        el.setAttribute("aria-pressed", el.dataset.thread === p.thread ? "true" : "false");
      });
    }
    if (p.mood === "intense") { state.intense = true; }
    if (p.kidsOnly) { state.kidsOnly = true; }
    state.afterSec = p.afterSec;
    $("moodBtn").textContent = "INTENSE: " + (state.intense ? "on" : "off");
    $("moodBtn").setAttribute("aria-pressed", String(state.intense));
    $("kidsBtn").textContent = "KIDS-SAFE: " + (state.kidsOnly ? "on" : "off");
    $("kidsBtn").setAttribute("aria-pressed", String(state.kidsOnly));
    syncBudgetUI(); rebuild();
  }
  $("nlGo").addEventListener("click", function () { applyNL($("nlInput").value); });
  $("nlInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); applyNL($("nlInput").value); }
    e.stopPropagation(); // let typing work: remote nav must not hijack keys here
  });
  $("chips").addEventListener("click", function (e) {
    var c = e.target.closest(".chip"); if (!c) return;
    $("nlInput").value = c.textContent; applyNL(c.textContent);
  });
  $("reentryBtn").addEventListener("click", function () {
    applyNL("I stopped at 23:10 yesterday, catch me up in 8 minutes");
  });

  /* ---------- playback ---------- */
  var video = $("video"), canvas = $("fallback"), player = null, cctx = null;

  function ensurePlayer() {
    if (player) return player;
    player = new window.CutlinePlayer(video, {
      episodeDuration: EP.durationSec,
      onScene: onScene,
      onProgress: onProgress,
      onEnded: onEnded,
      onTransition: onTransition
    });
    video.addEventListener("error", goSim, true);
    return player;
  }

  function goSim() {
    if (!player) return;
    player.simMode = true;
    if (!canvas.hidden) return;
    video.hidden = true; canvas.hidden = false;
    sizeCanvas(); drawSim();
    if (player.playing) player.play();
  }

  function sizeCanvas() {
    var r = video.getBoundingClientRect();
    canvas.width = Math.max(640, r.width); canvas.height = canvas.width * 9 / 16;
    cctx = canvas.getContext("2d");
  }

  var simFrame = null;
  function drawSim() {
    cancelAnimationFrame(simFrame);
    var t0 = Date.now();
    (function frame() {
      simFrame = requestAnimationFrame(frame);
      if (canvas.hidden || !cctx) return;
      var t = (Date.now() - t0) / 1000;
      var g = cctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      var h = (t * 12) % 360;
      g.addColorStop(0, "hsl(" + h + ",45%,14%)");
      g.addColorStop(1, "hsl(" + ((h + 60) % 360) + ",55%,26%)");
      cctx.fillStyle = g; cctx.fillRect(0, 0, canvas.width, canvas.height);
      var sc = player && player.current();
      cctx.fillStyle = "#fff"; cctx.font = "900 44px sans-serif";
      cctx.fillText("CUTLINE · SIMULATED FOOTAGE", 40, 80);
      cctx.fillStyle = "#22d3ee"; cctx.font = "700 34px sans-serif";
      cctx.fillText(sc ? (S.fmtRange(sc) + "  " + sc.title) : "—", 40, 140);
      cctx.fillStyle = "#9aa7d0"; cctx.font = "28px sans-serif";
      cctx.fillText(sc ? sc.synopsis : "", 40, 190);
      cctx.fillStyle = "#fbbf24"; cctx.font = "900 30px sans-serif";
      cctx.fillText("Connect video to play original footage — routing already works offline.", 40, canvas.height - 40);
    })();
  }

  var focusMemory = { home: null, choose: null, play: null };
  var lastScreen = "home";
  function show(screen) {
    try { if (current) focusMemory[lastScreen] = current; } catch (e) {}
    lastScreen = screen;
    $("screen-home").hidden = screen !== "home";
    $("screen-choose").hidden = screen !== "choose";
    $("screen-play").hidden = screen !== "play";
    ["navHome", "navCuts", "navPlay"].forEach(function (id) { var el = $(id); if (el) el.setAttribute("aria-pressed", "false"); });
    var nav = screen === "home" ? $("navHome") : screen === "choose" ? $("navCuts") : $("navPlay");
    if (nav) nav.setAttribute("aria-pressed", "true");
    document.body.classList.toggle("spoiler-on", !!state.spoiler);
    refreshFocusables();
    var root = screen === "play" ? $("screen-play") : screen === "choose" ? $("screen-choose") : $("screen-home");
    updateSavedBadges();
    var first = (focusMemory[screen] && document.contains(focusMemory[screen])) ? focusMemory[screen] : root.querySelector(".focusable");
    if (first) setFocus(first);
    if (screen === "home") renderLauncher();
  }
  function renderLauncher() {
    var prog = lsGet("cutline:progress:v1", null);
    var wrap = $("continueWrap");
    if (wrap) {
      var showCont = !!(prog && prog.cutTotal > 30 && prog.done < prog.cutTotal - 5);
      wrap.hidden = !showCont;
      if (showCont) {
        $("contFill").style.width = Math.round((prog.done / prog.cutTotal) * 100) + "%";
        $("contText").textContent = "Continue " + S.fmt(prog.done) + " / " + S.fmt(prog.cutTotal) + " · " + prog.label;
      }
    }
    var rail = $("histRail");
    if (rail) {
      var h = getHist(); rail.innerHTML = "";
      if (!h.length) { rail.innerHTML = '<div class="empty">No cuts yet — hit Play and we\'ll save it here.</div>'; return; }
      h.forEach(function (item) {
        var b = document.createElement("button");
        b.className = "tap-card hist-card focusable";
        b.innerHTML = "<b>" + S.fmt(item.dur) + "</b><span>" + escapeHtml(item.label) + "</span><small>" + item.n + " scenes · " + escapeHtml(item.thread) + (item.intense ? " · intense" : "") + "</small>";
        b.addEventListener("click", function () {
          state.budget = item.budget; state.thread = item.thread; state.intense = !!item.intense; state.kidsOnly = !!item.kidsOnly; state.afterSec = null; state.excluded = {};
          syncBudgetUI(); syncThreadUI(); rebuild(); show("choose");
        });
        rail.appendChild(b);
      });
      refreshFocusables();
    }
  }
  function syncThreadUI() {
    document.querySelectorAll("#threadRow .pill").forEach(function (el) {
      el.setAttribute("aria-pressed", el.dataset.thread === state.thread ? "true" : "false");
    });
  }

  $("playBtn").addEventListener("click", function () {
    if (!state.route || !state.route.scenes.length) return;
    ensurePlayer();
    show("play");
    $("playTitle").innerHTML = escapeHtml(routeLabel()) + " <span>— now playing original footage</span>";
    // (Re)bind the sample asset; mapping handles episode→video time.
    if (!video.currentSrc) {
      var src = window.DEMO_VIDEO_SOURCES && window.DEMO_VIDEO_SOURCES[0];
      if (src) { try { video.src = src; video.load(); } catch (e) {} }
      else if (player) { player.simMode = true; }
    }
    player.setRoute(state.route.scenes);
    if (player.simMode) {
      video.hidden = true; canvas.hidden = false;
      sizeCanvas(); drawSim();
    } else {
      video.hidden = false; canvas.hidden = true;
    }
    renderUpnext(-1);
    $("doneBox").hidden = true;
    $("cutTotal").textContent = S.fmt(player.totalCut());
    $("cutElapsed").textContent = "00:00";
    $("cutRemain").textContent = S.fmt(player.totalCut());
    player.play();
    $("ppBtn").textContent = "⏸ Pause";
    setFocus($("ppBtn"));
  });

  function renderUpnext(currentIdx) {
    var ul = $("upnext"); ul.innerHTML = "";
    state.route.scenes.forEach(function (sc, i) {
      var li = document.createElement("li");
      if (i === currentIdx) li.className = "now";
      li.innerHTML = "<span class='rng'>" + S.fmtRange(sc) + "</span> " + escapeHtml(sc.title) +
        " <span style='color:var(--muted)'>· " + S.fmt(sc.end - sc.start) + "</span>" +
        (i === currentIdx ? " <b style='color:var(--gold)'>▶ NOW</b>" : "");
      ul.appendChild(li);
    });
  }

  function onScene(scene, i, n) {
    $("bannerKicker").textContent = "SCENE " + (i + 1) + " OF " + n + " · CUTLINE CUT · EPISODE " + S.fmtRange(scene);
    $("bannerTitle").textContent = scene.title;
    renderUpnext(i);
  }
  var toastTimer = null;
  function onTransition(scene) {
    $("toastTitle").textContent = S.fmtRange(scene) + " · " + scene.title;
    $("transitionToast").classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $("transitionToast").classList.remove("show"); toastTimer = null; }, 1400);
  }
  function onProgress(p) {
    var done = Math.min(p.cutElapsed, p.cutTotal);
    $("cutBar").style.width = (p.cutTotal ? (done / p.cutTotal) * 100 : 0) + "%";
    $("cutElapsed").textContent = S.fmt(done);
    $("cutRemain").textContent = S.fmt(p.cutTotal - done);
    $("epPos").textContent = S.fmt(p.epNow != null ? p.epNow : p.scene.start);
    lsSet("cutline:progress:v1", { done: Math.round(done), cutTotal: Math.round(p.cutTotal), label: routeLabel(), at: Date.now() });
  }
  function onEnded() {
    $("ppBtn").textContent = "▶ Replay cut";
    var box = $("doneBox"); box.hidden = false;
    box.innerHTML = "✓ Cut complete — <b>" + S.fmt(state.route.totalDuration) +
      "</b> of story in your budget. The TV reshaped 52:14 around the time you had. " +
      "Press <b>‹ Back</b> to morph the time or switch threads.";
  }

  $("ppBtn").addEventListener("click", function () {
    ensurePlayer();
    if (!player.route.length) return;
    if (player.playing) { player.pause(); $("ppBtn").textContent = "▶ Play"; }
    else {
      if (player.index >= player.route.length - 1 && !player.playing && player.cutElapsed > 0) {
        player.setRoute(state.route.scenes); // replay
      }
      player.play(); $("ppBtn").textContent = "⏸ Pause";
    }
  });
  $("nextBtn").addEventListener("click", function () { if (player) { player.next(); } });
  $("prevBtn").addEventListener("click", function () { if (player) { player.prev(); } });
  $("backBtn").addEventListener("click", function () {
    if (player) player.pause();
    cancelAnimationFrame(simFrame);
    show("choose");
  });

  /* ---------- tech modal ---------- */
  $("techBtn").addEventListener("click", function () {
    var r = state.route;
    $("techPre").textContent = JSON.stringify({
      episode: EP.id, budgetSec: r.budgetSec,
      request: { thread: state.thread, intense: state.intense, kidsOnly: state.kidsOnly, afterSec: state.afterSec },
      cut: r.ids,
      totalDuration: r.totalDuration, coverage: +r.coverage.toFixed(3),
      scoring: "100*importance + plot prior (reveal+12, resolution+10, confrontation+8, discovery+6, twist+5) + thread(+30 / x0.45) + intense(3*intensity); knapsack DP + dependency closure"
    }, null, 2);
    $("techModal").hidden = false;
    setFocus($("techClose"));
  });
  $("techClose").addEventListener("click", function () { $("techModal").hidden = true; setFocus($("playBtn")); });

  /* ---------- Fire TV remote: spatial nav + keys ---------- */
  var focusables = [], current = null;
  function refreshFocusables() {
    focusables = Array.prototype.filter.call(
      document.querySelectorAll(".focusable"),
      function (el) { return el.offsetParent !== null && !el.disabled; }
    );
    if (current && focusables.indexOf(current) === -1) current = null;
  }
  function setFocus(el) {
    if (!el) return;
    focusables.forEach(function (f) { f.classList.remove("focused"); });
    current = el; el.classList.add("focused");
    try { el.focus({ preventScroll: false }); } catch (e) { try { el.focus(); } catch (e2) {} }
    if (el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function move(dir) {
    if (!focusables.length) refreshFocusables();
    if (!current) { setFocus(focusables[0]); return; }
    var r0 = current.getBoundingClientRect();
    var cx0 = r0.left + r0.width / 2, cy0 = r0.top + r0.height / 2;
    var best = null, bestScore = Infinity;
    focusables.forEach(function (el) {
      if (el === current) return;
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = cx - cx0, dy = cy - cy0, primary = 0, secondary = 0;
      if (dir === "up") { if (dy >= -4) return; primary = -dy; secondary = Math.abs(dx); }
      if (dir === "down") { if (dy <= 4) return; primary = dy; secondary = Math.abs(dx); }
      if (dir === "left") { if (dx >= -4) return; primary = -dx; secondary = Math.abs(dy); }
      if (dir === "right") { if (dx <= 4) return; primary = dx; secondary = Math.abs(dy); }
      var score = primary + secondary * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) setFocus(best);
  }

  document.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    var typing = tag === "INPUT" && e.target.type === "text";
    var k = e.key;
    // Fire TV: Backspace/GoBack(461,10009) + Escape all go back.
    if (k === "Escape" || k === "GoBack" || e.keyCode === 461 || e.keyCode === 10009 || (!typing && k === "Backspace")) {
      e.preventDefault();
      if (!$("techModal").hidden) { $("techModal").hidden = true; setFocus($("playBtn")); }
      else if (!$("screen-play").hidden) $("backBtn").click();
      return;
    }
    if (typing) return; // don't hijack text entry
    if (k === "ArrowUp") { e.preventDefault(); move("up"); }
    else if (k === "ArrowDown") { e.preventDefault(); move("down"); }
    else if (k === "ArrowLeft" && !(current && current.type === "range")) { e.preventDefault(); move("left"); }
    else if (k === "ArrowRight" && !(current && current.type === "range")) { e.preventDefault(); move("right"); }
    else if (k === "Enter" && current && current.tagName !== "INPUT" && current.tagName !== "VIDEO") { e.preventDefault(); current.click(); }
    else if ((k === " " || k === "MediaPlayPause" || k === "Play" || k === "Pause" || e.keyCode === 179 || e.keyCode === 19) && !$("screen-play").hidden) { e.preventDefault(); $("ppBtn").click(); }
    else if ((k === "MediaFastForward" || k === "MediaNextTrack" || e.keyCode === 228 || e.keyCode === 417) && !$("screen-play").hidden) { e.preventDefault(); if (player) player.next(); }
    else if ((k === "MediaRewind" || k === "MediaPreviousTrack" || e.keyCode === 227 || e.keyCode === 412) && !$("screen-play").hidden) { e.preventDefault(); if (player) player.prev(); }
  });
  document.addEventListener("mouseover", function (e) {
    if (IS_FIRETV) return; // Fire TV has no hover: ignore mouse to keep D-pad focus stable
    var f = e.target.closest && e.target.closest(".focusable");
    if (f) setFocus(f);
  });
  // FireOS suspends the web app on Home / screensaver: pause + persist progress.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && player && player.playing) { try { player.pause(); } catch (e) {} var b = $("ppBtn"); if (b) b.textContent = "▶ Play"; }
  });
  window.addEventListener("blur", function () { if (player && player.playing && IS_FIRETV) { try { player.pause(); } catch (e) {} } });

  /* ---------- boot ---------- */
  if (!S || !EP || typeof SCENES === "undefined") {
    document.querySelector("main").innerHTML =
      '<div class="empty">Missing data scripts (solver / episode / scenes). Check script paths and reload.</div>';
    return;
  }
  $("epTitle").textContent = EP.title.toUpperCase() + " · S01E07";
  try {
    var prefs = JSON.parse(localStorage.getItem("cutline:v1") || "{}");
    if (prefs.budget === "full" || (isFinite(prefs.budget) && prefs.budget >= 60)) state.budget = prefs.budget;
    if (prefs.thread) state.thread = prefs.thread;
    if (prefs.intense) state.intense = !!prefs.intense;
    if (prefs.kidsOnly) state.kidsOnly = !!prefs.kidsOnly;
    if (state.thread) document.querySelectorAll("#threadRow .pill").forEach(function (el) {
      el.setAttribute("aria-pressed", el.dataset.thread === state.thread ? "true" : "false");
    });
    if (state.intense) { $("moodBtn").textContent = "INTENSE: on"; $("moodBtn").setAttribute("aria-pressed", "true"); }
    if (state.kidsOnly) { $("kidsBtn").textContent = "KIDS-SAFE: on"; $("kidsBtn").setAttribute("aria-pressed", "true"); }
  } catch (e) {}
  // Alexa / deep-link entry: e.g. ?autoplay=900&thread=mystery&mood=intense or voice companion.
  try {
    var _q = getQuery();
    if (_q.thread && (_q.thread === "mystery" || _q.thread === "heart" || _q.thread === "chase")) state.thread = _q.thread;
    if (_q.mood === "intense") state.intense = true;
    if (_q.kids === "1") state.kidsOnly = true;
    if (_q.budget) { var _b = parseInt(_q.budget, 10); if (isFinite(_b) && _b >= 60) state.budget = _b; if (_q.budget === "full") state.budget = "full"; }
    if (_q.autoplay) { var _a = parseInt(_q.autoplay, 10); if (isFinite(_a)) state.budget = _a; }
    if (state.thread) document.querySelectorAll("#threadRow .pill").forEach(function (el) { el.setAttribute("aria-pressed", el.dataset.thread === state.thread ? "true" : "false"); });
  } catch (e) {}
  syncBudgetUI();
  rebuild();
  function oneClick(sec) {
    state.budget = sec; state.thread = "all"; state.afterSec = null;
    document.querySelectorAll("#threadRow .pill").forEach(function (el) {
      el.setAttribute("aria-pressed", el.dataset.thread === "all" ? "true" : "false");
    });
    syncBudgetUI(); rebuild();
    $("playBtn").click();
  }
  var oc = $("oneClickPlay"); if (oc) oc.addEventListener("click", function () { oneClick(900); });
  document.querySelectorAll("[data-oneclick]").forEach(function (b) {
    b.addEventListener("click", function () { oneClick(parseInt(b.dataset.oneclick, 10)); });
  });
  var stickyGo = $("stickyGo"); if (stickyGo) stickyGo.addEventListener("click", function () { $("playBtn").click(); });
  var share = $("shareBtn"); if (share) share.addEventListener("click", function () {
    var code = "CUTLINE " + routeLabel() + " — " + state.route.ids.join(",") + " (" + S.fmt(state.route.totalDuration) + ")";
    try { history.replaceState(null, "", encodeCut()); } catch (e) {}
    var link = "";
    try { link = location.href; } catch (e) {}
    try { if (navigator.clipboard && navigator.clipboard.writeText && !IS_FIRETV) navigator.clipboard.writeText(link || code); } catch (e) {}
    // TV-friendly: show a big code the phone can type, clipboard is useless on Fire TV.
    $("techPre").textContent = "Share this cut:\n\n" + code + "\n\nLink:\n" + link + "\n\nOn your phone, open the link to get the same route.";
    $("techModal").hidden = false;
    setFocus($("techClose"));
  });
  // Launcher wiring
  var savedHash = decodeCut();
  if (savedHash) {
    if (savedHash.b === "full" || isFinite(savedHash.b)) state.budget = savedHash.b;
    if (savedHash.t) state.thread = savedHash.t;
    state.intense = !!savedHash.i; state.kidsOnly = !!savedHash.k; state.afterSec = savedHash.a || null;
    (savedHash.x || []).forEach(function (id) { state.excluded[id] = true; });
  }
  syncBudgetUI(); syncThreadUI();
  if (state.intense) { $("moodBtn").textContent = "INTENSE: on"; $("moodBtn").setAttribute("aria-pressed", "true"); }
  if (state.kidsOnly) { $("kidsBtn").textContent = "KIDS-SAFE: on"; $("kidsBtn").setAttribute("aria-pressed", "true"); }
  function goPlay(budget) {
    state.budget = budget; state.afterSec = null;
    syncBudgetUI(); rebuild(); pushHistSafe(); $("playBtn").click();
  }
  var _pushed = false;
  function pushHistSafe() { _pushed = true; }
  var _origPlay = $("playBtn").onclick;
  // nav
  $("navHome").addEventListener("click", function () { show("home"); });
  $("navCuts").addEventListener("click", function () { show("choose"); });
  $("navPlay").addEventListener("click", function () { if (state.route) { show("play"); } });
  $("launchBrowse").addEventListener("click", function () { show("choose"); });
  $("launchPlay").addEventListener("click", function () { goPlay(900); });
  $("launchCatchup").addEventListener("click", function () { applyNL("I stopped at 23:10 yesterday, catch me up in 8 minutes"); show("choose"); });
  document.querySelectorAll("[data-launch]").forEach(function (b) {
    b.addEventListener("click", function () { goPlay(b.dataset.launch === "full" ? "full" : parseInt(b.dataset.launch, 10)); });
  });
  document.querySelectorAll("[data-vibe]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.dataset.vibe;
      if (v === "intense") { state.intense = true; $("moodBtn").textContent = "INTENSE: on"; $("moodBtn").setAttribute("aria-pressed", "true"); }
      else if (v === "kids") { state.kidsOnly = true; $("kidsBtn").textContent = "KIDS-SAFE: on"; $("kidsBtn").setAttribute("aria-pressed", "true"); }
      else { state.thread = v; syncThreadUI(); }
      state.budget = 900; syncBudgetUI(); rebuild(); show("choose");
    });
  });
  $("clearHist").addEventListener("click", function () { lsSet("cutline:history:v2", []); renderLauncher(); });
  var _contR = $("contResume"); if (_contR) _contR.addEventListener("click", function () { show("choose"); $("playBtn").click(); });
  var _contX = $("contRestart"); if (_contX) _contX.addEventListener("click", function () { lsSet("cutline:progress:v1", null); renderLauncher(); });
  // wrap original play to save history + share hash
  $("playBtn").addEventListener("click", function () {
    setTimeout(function () {
      try {
        pushHist();
        history.replaceState(null, "", encodeCut());
        lsSet("cutline:progress:v1", { done: 0, cutTotal: Math.round(state.route.totalDuration), label: routeLabel(), at: Date.now() });
      } catch (e) {}
    }, 0);
  }, true);
  var _share = $("shareBtn");
  if (_share) _share.addEventListener("click", function () {
    try { history.replaceState(null, "", encodeCut()); } catch (e) {}
  }, true);
  // spoiler toggle injected into route head
  var _rh = document.querySelector(".route-head");
  if (_rh && !$("spoilerBtn")) {
    var _sb = document.createElement("button");
    _sb.id = "spoilerBtn"; _sb.className = "chip focusable"; _sb.textContent = "Spoilers: hidden";
    _sb.addEventListener("click", function () {
      state.spoiler = !state.spoiler;
      document.body.classList.toggle("spoiler-on", !!state.spoiler);
      _sb.textContent = state.spoiler ? "Spoilers: hidden" : "Spoilers: shown";
    });
    _rh.appendChild(_sb);
    document.body.classList.toggle("spoiler-on", !!state.spoiler);
  }
  function initOttFireTv() {
    if (FTV) {
      try {
        var ai = FTV.parseAlexaIntent();
        if (ai.voice) applyNL(ai.voice);
        FTV.setMediaSession(routeLabel() + " · CUTLINE", "Harbor Lights");
        var nb = $("ottNetBadge"); if (nb) nb.textContent = "FireOS net: " + FTV.networkKind();
      } catch (e) {}
      try { FTV.keepAwake($("setWake") ? $("setWake").checked !== false : true); } catch (e) {}
    }
    if (!OTT) return;
    var rail = $("ottRail"); var pick = $("ottProviderPick");
    function paint() {
      var conn = OTT.getConnected();
      if (rail) {
        rail.innerHTML = "";
        OTT.PROVIDERS.forEach(function (p) {
          var on = conn.indexOf(p.id) !== -1;
          var b = document.createElement("button");
          b.className = "ott-card focusable"; b.setAttribute("aria-pressed", on ? "true" : "false");
          b.innerHTML = "<span class='ott-ico' style='background:" + p.color + "'>" + p.short + "</span><span><b>" + p.name + "</b><small>" + (on ? "connected · OK to toggle" : "press OK to connect") + "</small></span>";
          b.addEventListener("click", function () {
            var c = OTT.getConnected(); var i = c.indexOf(p.id);
            if (i === -1) c.push(p.id); else c.splice(i, 1);
            OTT.setConnected(c); paint(); syncPick();
          });
          rail.appendChild(b);
        });
      }
      syncPick();
    }
    function syncPick() {
      if (!pick) return; var conn = OTT.getConnected();
      pick.innerHTML = "";
      conn.forEach(function (id) {
        var p = OTT.byId(id); if (!p) return;
        var o = document.createElement("option"); o.value = id; o.textContent = p.name; pick.appendChild(o);
      });
      if (!pick.options.length) {
        var o2 = document.createElement("option"); o2.value = "prime"; o2.textContent = "Prime Video (default)"; pick.appendChild(o2);
      }
    }
    function doSearch() {
      var q = $("ottSearch") ? $("ottSearch").value : "";
      var box = $("ottResults"); if (!box) return; box.innerHTML = "";
      var conn = OTT.getConnected();
      OTT.searchCatalog(q).forEach(function (hit) {
        var avail = hit.providers.filter(function (id) { return conn.indexOf(id) !== -1; });
        var row = document.createElement("div"); row.className = "ott-hit";
        row.innerHTML = "<span><b>" + escapeHtml(hit.title) + "</b> <span style='color:var(--muted)'>· " + escapeHtml(hit.dur) + " · " + escapeHtml(hit.note) + "</span></span>";
        var pv = document.createElement("span"); pv.className = "prov";
        (avail.length ? avail : hit.providers.slice(0, 2)).forEach(function (id) {
          var p = OTT.byId(id); if (!p) return;
          var b = document.createElement("button"); b.className = "chip focusable";
          b.textContent = (avail.length ? "▶ " : "") + p.name;
          b.addEventListener("click", function () { OTT.tryOpen(id, hit.title); });
          pv.appendChild(b);
        });
        row.appendChild(pv); box.appendChild(row);
      });
      refreshFocusables();
    }
    paint();
    var go = $("ottGo"); if (go) go.addEventListener("click", doSearch);
    var si = $("ottSearch"); if (si) si.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Enter") doSearch(); });
    var open = $("ottOpenBtn"); if (open) open.addEventListener("click", function () {
      var id = pick ? pick.value : "prime";
      var l = OTT.tryOpen(id, "Harbor Lights S01E07");
      if (l) { try { window.open(l.web, "_blank", "noopener"); } catch (e) { location.href = l.web; } }
    });
    var no = $("navOtt"); if (no) no.addEventListener("click", function () { show("home"); setTimeout(function () { var r = $("ottRail"); if (r) { var f = r.querySelector(".focusable"); if (f) setFocus(f); } }, 50); });
    var ns = $("navSettings"); if (ns) ns.addEventListener("click", function () { $("settingsModal").hidden = false; setFocus($("settingsClose")); });
    var sc = $("settingsClose"); if (sc) sc.addEventListener("click", function () { $("settingsModal").hidden = true; setFocus($("navSettings")); });
    var rs = $("setResetOtt"); if (rs) rs.addEventListener("click", function () { OTT.setConnected([]); paint(); });
    var sw = $("setWake"); if (sw) sw.addEventListener("change", function () { if (FTV) FTV.keepAwake(sw.checked); });
    var sm = $("setMotion"); if (sm) sm.addEventListener("change", function () { document.body.classList.toggle("reduce-motion", sm.checked); });
    var ss = $("setSpoiler"); if (ss) ss.addEventListener("change", function () { state.spoiler = ss.checked; document.body.classList.toggle("spoiler-on", state.spoiler); });
  }
  function initFireOSBuiltIn() {
    try {
      var prof = FTV ? FTV.deviceProfile() : null;
      var sd = $("sysDevice"); if (sd && prof) sd.textContent = prof.model;
      var tick = function () { var c = $("sysClock"); if (c && FTV) c.textContent = FTV.systemTime(); };
      tick(); setInterval(tick, 15000);
      var sn = $("sysNet"); if (sn) sn.textContent = navigator.onLine === false ? "Offline" : "Online";
      window.addEventListener("online", function () { var x = $("sysNet"); if (x) x.textContent = "Online"; });
      window.addEventListener("offline", function () { var x2 = $("sysNet"); if (x2) x2.textContent = "Offline · cuts still work"; });
    } catch (e) {}
    function paintRecents() {
      var box = $("fireRecents"); if (!box || !FTV) return;
      var r = FTV.getRecents(); box.innerHTML = "";
      if (!r.length) { box.innerHTML = '<div class="empty">Nothing yet — your cuts will live here like a built-in channel.</div>'; return; }
      r.forEach(function (it) {
        var b = document.createElement("button");
        b.className = "fire-card focusable";
        b.innerHTML = "<b>" + escapeHtml(it.label) + "</b><small>" + escapeHtml(S.fmt(it.dur || 0)) + " · resume with OK</small><div class='resume-bar'><div style='width:35%'></div></div>";
        b.addEventListener("click", function () { show("choose"); var p = $("playBtn"); if (p) p.click(); });
        box.appendChild(b);
      });
      refreshFocusables();
    }
    paintRecents();
    try {
      if (FTV) FTV.bindMediaKeys({
        play: function () { var p = $("ppBtn"); if (p && !$("screen-play").hidden) p.click(); },
        pause: function () { var p2 = $("ppBtn"); if (p2 && !$("screen-play").hidden) p2.click(); },
        previoustrack: function () { var b = $("prevBtn"); if (b) b.click(); },
        nexttrack: function () { var n = $("nextBtn"); if (n) n.click(); }
      });
    } catch (e) {}
    var _play = $("playBtn");
    if (_play) _play.addEventListener("click", function () {
      setTimeout(function () {
        try { if (FTV && state.route) FTV.pushRecent({ label: routeLabel(), dur: state.route.totalDuration }); } catch (e) {}
        paintRecents();
        try { if (FTV) FTV.setMediaSession(routeLabel() + " · CUTLINE", "Harbor Lights"); } catch (e) {}
      }, 50);
    }, true);
    function openVoice() { var o = $("voiceOverlay"); if (!o) return; o.hidden = false; setFocus($("voiceText")); }
    function closeVoice() { var o2 = $("voiceOverlay"); if (o2) o2.hidden = true; }
    function runVoice(cmd) {
      var v = FTV ? FTV.parseAlexaVoice(cmd) : null;
      if (!v) { applyNL(cmd); closeVoice(); show("choose"); return; }
      if (v.action === "pause" || v.action === "play") { closeVoice(); show("play"); var p = $("ppBtn"); if (p) p.click(); return; }
      if (v.action === "next") { closeVoice(); var n = $("nextBtn"); if (n) n.click(); return; }
      if (v.action === "prev") { closeVoice(); var b2 = $("prevBtn"); if (b2) b2.click(); return; }
      if (v.action === "home") { closeVoice(); show("home"); return; }
      var parts = [];
      if (v.budgetMin) parts.push("I have " + v.budgetMin + " minutes");
      if (v.thread) parts.push(v.thread + " thread only");
      if (v.mood === "intense") parts.push("intense version");
      if (v.kidsOnly) parts.push("kids safe");
      if (parts.length) applyNL(parts.join(", "));
      else if (cmd) applyNL(cmd);
      closeVoice(); show("choose");
    }
    var nv = $("navVoice"); if (nv) nv.addEventListener("click", openVoice);
    var vc = $("voiceClose"); if (vc) vc.addEventListener("click", closeVoice);
    var vg = $("voiceGo"); if (vg) vg.addEventListener("click", function () { runVoice($("voiceText").value); });
    var vt = $("voiceText");
    if (vt) vt.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Enter") runVoice(vt.value); });
    var pinBuf = "";
    function paintPin() { var d = $("pinDots"); if (d) d.textContent = (pinBuf + "••••").slice(0, 4); }
    function openPin() { pinBuf = ""; paintPin(); var m = $("pinModal"); if (m) { m.hidden = false; setFocus($("pinCancel")); } }
    var pad = $("pinPad");
    if (pad && !pad.children.length) {
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "C", "OK"].forEach(function (k) {
        var b = document.createElement("button"); b.textContent = k; b.className = "focusable";
        b.addEventListener("click", function () {
          if (k === "C") pinBuf = "";
          else if (k === "OK") {
            if (FTV && FTV.pinCheck(pinBuf || "1111")) { $("pinModal").hidden = true; state.kidsOnly = true; syncBudgetUI(); rebuild(); show("choose"); }
            else { pinBuf = ""; paintPin(); return; }
          } else if (pinBuf.length < 4) pinBuf += k;
          paintPin(); refreshFocusables();
        });
        pad.appendChild(b);
      });
    }
    var pc = $("pinCancel"); if (pc) pc.addEventListener("click", function () { $("pinModal").hidden = true; });
    document.querySelectorAll('[data-vibe="kids"]').forEach(function (b) {
      b.addEventListener("click", function (e) { if (FTV && !state.kidsOnly) { e.stopPropagation(); openPin(); } }, true);
    });
  }
  initOttFireTv();
  initFireOSBuiltIn();
  refreshFocusables();
  show(savedHash ? "choose" : "home");
  if (savedHash) rebuild();
  setFocus($("launchPlay") || $("oneClickPlay"));
})();
