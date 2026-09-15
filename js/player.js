/* CUTLINE playback queue — plays an ordered scene route as one coherent cut.
 * Maps episode timestamps onto the bundled demo video proportionally, so the
 * full 52:14 routing logic is demonstrable with a single sample asset.
 * Falls back to a canvas visualization when the video cannot load (offline).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CutlinePlayer = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var END_TOLERANCE_SEC = 0.12;
  var SIM_TICK_MS = 1000;

  function Player(videoEl, opts) {
    opts = opts || {};
    this.video = videoEl || null;
    this.episodeDuration = opts.episodeDuration || 3134;
    this.onScene = opts.onScene || function () {};
    this.onProgress = opts.onProgress || function () {};
    this.onEnded = opts.onEnded || function () {};
    this.onTransition = opts.onTransition || function () {};
    this.route = [];
    this.index = -1;
    this.playing = false;
    this.simMode = false;
    this.simTimer = null;
    this.simElapsed = 0; // seconds into current scene (episode time)
    this.cutElapsed = 0; // episode seconds already watched in this cut
    this._boundTime = this._onTime.bind(this);
    this._boundEnded = this._onVideoEnded.bind(this);
    this._boundError = this._onVideoError.bind(this);
    if (this.video) {
      this.video.addEventListener("timeupdate", this._boundTime);
      this.video.addEventListener("ended", this._boundEnded);
      this.video.addEventListener("error", this._boundError);
    }
  }

  Player.prototype.mapToVideo = function (epSec) {
    if (!this.video || !this.video.duration || !isFinite(this.video.duration)) return 0;
    return (epSec / this.episodeDuration) * this.video.duration;
  };

  Player.prototype.mapToEpisode = function (vidSec) {
    if (!this.video || !this.video.duration || !isFinite(this.video.duration)) return 0;
    return (vidSec / this.video.duration) * this.episodeDuration;
  };

  Player.prototype.destroy = function () {
    this.stop();
    if (this.video) {
      try {
        this.video.removeEventListener("timeupdate", this._boundTime);
        this.video.removeEventListener("ended", this._boundEnded);
        this.video.removeEventListener("error", this._boundError);
      } catch (e) {}
    }
    this.video = null;
    this.route = [];
  };

  Player.prototype._onVideoError = function () {
    if (!this.simMode) this.simMode = true;
  };

  Player.prototype.setRoute = function (routeScenes) {
    this.stop();
    this.route = Array.isArray(routeScenes) ? routeScenes.slice() : [];
    this.index = -1;
    this.cutElapsed = 0;
    this.simElapsed = 0;
    // Offline / no-video → simulation mode.
    this.simMode = !this.video ||
      (this.video.networkState === 3) ||
      (this.video.readyState === 0 && this.video.networkState === 0 && !this.video.currentSrc);
  };

  Player.prototype.totalCut = function () {
    return this.route.reduce(function (t, s) { return t + (s.end - s.start); }, 0);
  };

  Player.prototype.current = function () {
    return this.route[this.index] || null;
  };

  Player.prototype.play = function () {
    if (!this.route.length) return;
    this.playing = true;
    if (this.simMode) { this._playSim(); return; }
    if (this.index < 0) this._goto(0);
    else if (this.video) this.video.play();
  };

  Player.prototype.pause = function () {
    this.playing = false;
    if (this.simMode) { if (this.simTimer) clearInterval(this.simTimer); this.simTimer = null; }
    else if (this.video) this.video.pause();
  };

  Player.prototype.stop = function () {
    this.pause();
    this.index = -1;
    this.cutElapsed = 0;
    this.simElapsed = 0;
  };

  Player.prototype.next = function () {
    var cur = this.route[this.index];
    if (cur) this.cutElapsed += cur.end - cur.start; // skipping counts as watched
    this._goto(this.index + 1);
  };
  Player.prototype.prev = function () {
    if (this.index <= 0) { this._goto(0); return; }
    this._goto(this.index - 1, true);
  };

  Player.prototype._goto = function (i, restartCut) {
    if (i < 0) i = 0;
    if (i >= this.route.length) { this._finish(); return; }
    if (restartCut) {
      this.cutElapsed = 0;
      for (var k = 0; k < i; k++) this.cutElapsed += this.route[k].end - this.route[k].start;
    }
    var isSequential = this.index >= 0 && i === this.index + 1;
    var jumping = this.index >= 0 && !isSequential && i !== this.index;
    this.index = i;
    this.simElapsed = 0;
    var scene = this.route[i];
    this.onScene(scene, i, this.route.length);
    if (jumping) this.onTransition(scene, i);
    if (this.simMode) { if (this.playing) this._playSim(); return; }
    if (this.video) {
      try { this.video.currentTime = this.mapToVideo(scene.start); } catch (e) {}
      if (this.playing) { var p = this.video.play(); if (p && p.catch) p.catch(function () {}); }
    }
  };

  Player.prototype._onTime = function () {
    if (!this.playing || this.simMode || this.index < 0) return;
    if (!this.video || !isFinite(this.video.currentTime)) return;
    var scene = this.route[this.index];
    if (!scene) return;
    var endVid = this.mapToVideo(scene.end);
    if (!isFinite(endVid) || endVid <= 0) return;
    if (this.video.currentTime >= endVid - END_TOLERANCE_SEC) {
      this.cutElapsed += scene.end - scene.start;
      this._goto(this.index + 1);
    } else {
      var epNow = this.mapToEpisode(this.video.currentTime);
      this.onProgress(this._progress(scene, epNow));
    }
  };

  Player.prototype._onVideoEnded = function () {
    // Sample asset ended mid-route (mapping edge): advance, don't stop the cut.
    if (this.playing && this.index >= 0 && this.index < this.route.length - 1) {
      this.cutElapsed += this.route[this.index].end - this.route[this.index].start;
      this._goto(this.index + 1);
    } else if (this.playing) this._finish();
  };

  Player.prototype._progress = function (scene, epNow) {
    var done = this.cutElapsed + Math.max(0, Math.min(epNow, scene.end) - scene.start);
    return { cutElapsed: done, cutTotal: this.totalCut(), scene: scene, index: this.index, epNow: epNow };
  };

  // --- Simulation fallback (offline): real-time timer over episode seconds.
  Player.prototype._playSim = function () {
    var self = this;
    if (!this.route.length) { this._finish(); return; }
    if (this.simTimer) clearInterval(this.simTimer);
    if (this.index < 0) {
      this.index = 0;
      this.onScene(this.route[0], 0, this.route.length);
    }
    this.simTimer = setInterval(function () {
      var scene = self.route[self.index];
      if (!scene) { self._finish(); return; }
      self.simElapsed += 1;
      var done = self.cutElapsed + Math.min(self.simElapsed, scene.end - scene.start);
      self.onProgress({ cutElapsed: done, cutTotal: self.totalCut(), scene: scene, index: self.index, sim: true, epNow: scene.start + Math.min(self.simElapsed, scene.end - scene.start) });
      if (self.simElapsed >= scene.end - scene.start) {
        self.cutElapsed += scene.end - scene.start;
        self.simElapsed = 0;
        self._goto(self.index + 1);
      }
    }, SIM_TICK_MS);
  };

  Player.prototype._finish = function () {
    this.pause();
    try {
      this.onEnded({ cutTotal: this.totalCut() });
    } catch (e) {}
  };

  return Player;
});
