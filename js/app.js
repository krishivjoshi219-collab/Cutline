/* CUTLINE app — 10-foot Fire TV UX: budget select, live route preview, playback. */
(function () {
  "use strict";
  var S = window.CutlineSolver;
  var EP = window.EPISODE;

  var state = {
    budget: 900,            // seconds, or "full"
    thread: "all",
    intense: false,
    kidsOnly: false,
    afterSec: null,         // re-entry stop point
    excluded: {},           // sceneId -> true (heatmap toggles)
    route: null
  };

  function $(id) { return document.getElementById(id); }
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
    var n = Math.max(1, Math.round(imp * 5));
    return "●".repeat(n) + "○".repeat(5 - n);
  }

  function renderPreview() {
    var r = state.route;
    $("routeTitle").textContent = routeLabel();
    $("heroBudget").textContent = state.afterSec != null
      ? Math.round(budgetSec() / 60) + " catch-up minutes"
      : (state.budget === "full" ? "the whole 52 minutes" : Math.round(budgetSec() / 60) + " minutes");
    $("routeTotal").textContent = S.fmt(r.totalDuration) + " / " + S.fmt(r.budgetSec) + " · " + r.scenes.length + " scenes";
    $("coverageBar").style.width = Math.min(100, r.coverage * 100).toFixed(1) + "%";
    $("coverageText").textContent = Math.round(r.coverage * 100) + "% of episode kept";
    $("morphVal").textContent = S.fmt(budgetSec());

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
        "<span class='meta'>" + S.fmt(sc.end - sc.start) + " · " + sc.threads.join(" / ") + " · " + sc.plot.join(", ") + " · " + escapeHtml(sc.synopsis) + "</span></span>" +
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
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
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

  $("morph").addEventListener("input", function (e) {
    clearReentry();
    state.budget = parseInt(e.target.value, 10) * 60;
    syncBudgetUI(); rebuild();
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
  var video = $("video"), canvas = $("fallback"), player = null, cctx = null, raf = 0;

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
    if (!player || player.simMode) return;
    player.simMode = true;
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

  function show(screen) {
    $("screen-choose").hidden = screen !== "choose";
    $("screen-play").hidden = screen !== "play";
    refreshFocusables();
    var first = (screen === "play" ? $("screen-play") : $("screen-choose")).querySelector(".focusable");
    if (first) setFocus(first);
  }

  $("playBtn").addEventListener("click", function () {
    if (!state.route || !state.route.scenes.length) return;
    ensurePlayer();
    show("play");
    $("playTitle").innerHTML = escapeHtml(routeLabel()) + " <span>— now playing original footage</span>";
    // (Re)bind the sample asset; mapping handles episode→video time.
    if (!video.currentSrc) {
      video.src = window.DEMO_VIDEO_SOURCES[0];
      video.load();
    }
    video.hidden = false; canvas.hidden = true;
    player.setRoute(state.route.scenes);
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
  function onTransition(scene) {
    $("toastTitle").textContent = S.fmtRange(scene) + " · " + scene.title;
    $("transitionToast").classList.add("show");
    setTimeout(function () { $("transitionToast").classList.remove("show"); }, 1400);
  }
  function onProgress(p) {
    var done = Math.min(p.cutElapsed, p.cutTotal);
    $("cutBar").style.width = (p.cutTotal ? (done / p.cutTotal) * 100 : 0) + "%";
    $("cutElapsed").textContent = S.fmt(done);
    $("cutRemain").textContent = S.fmt(p.cutTotal - done);
    $("epPos").textContent = S.fmt(p.epNow != null ? p.epNow : p.scene.start);
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
    else if ((k === " " || k === "MediaPlayPause") && !$("screen-play").hidden) { e.preventDefault(); $("ppBtn").click(); }
  });
  document.addEventListener("mouseover", function (e) {
    var f = e.target.closest && e.target.closest(".focusable");
    if (f) setFocus(f);
  });

  /* ---------- boot ---------- */
  $("epTitle").textContent = EP.title.toUpperCase() + " · S01E07";
  syncBudgetUI();
  rebuild();
  refreshFocusables();
  setFocus(document.querySelector('#budgetCards [data-budget="900"]'));
})();
