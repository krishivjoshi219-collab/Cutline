import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Linking, Platform, BackHandler } from "react-native";
import * as ReactNative from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Video, { type VideoRef, type OnProgressData, type OnLoadData } from "react-native-video";
import KeepAwake from "react-native-keep-awake";
import { buildRoute, fmt, fmtRange, type Thread } from "./src/solver";
import { EPISODE, SCENES, DEMO_VIDEO, OTT_PROVIDERS } from "./src/data";

type Screen = "home" | "choose" | "play";

// Remote-event payload (structural — matches the TV fork's TVEvent shape
// without importing it, so this file compiles on stock react-native too).
export interface TVRemoteEvent {
  eventType: string;
  eventKeyAction?: string | number;
  tag?: number;
  target?: number;
  body?: unknown;
}

type TVEventHandlerHook = (handler: (evt: TVRemoteEvent) => void) => void;

// `useTVEventHandler` is only exported by TV-enabled React Native builds
// (react-native-tvos fork / FireOS). Stock `react-native` does not export it,
// so calling it unconditionally crashes the app on startup. Resolve the real
// hook when present, otherwise fall back to a no-op so the same bundle still
// runs on phone for debugging.
const useTVEventHandler: TVEventHandlerHook =
  (ReactNative as unknown as { useTVEventHandler?: TVEventHandlerHook }).useTVEventHandler ?? (() => undefined);

// react-native-keep-awake@4 ships a <KeepAwake /> component with static
// activate()/deactivate() — there is no `useKeepAwake` export, so importing
// one crashes on startup. Local equivalent that additionally tolerates a
// missing native module (Expo Go / phone debugging).
function useKeepAwake(): void {
  useEffect(() => {
    try {
      KeepAwake.activate();
    } catch {
      // Native module not linked — screen-sleep prevention unavailable.
    }
    return () => {
      try {
        KeepAwake.deactivate();
      } catch {
        /* noop */
      }
    };
  }, []);
}
const FULL_BUDGET = 3134;
const BUDGETS = [300, 900, 1800, FULL_BUDGET] as const;
const STORAGE_KEY = "cutline:rn:v1";

// FireOS runs as Android TV. Keep D-pad / remote logic behind this flag
// so the same TS bundle still runs on phone for debugging.
const isTV = Platform.isTV === true;
const isFireOS = Platform.OS === "android" && isTV;

type PersistedState = {
  budget?: number;
  thread?: Thread;
  intense?: boolean;
  kidsOnly?: boolean;
};

export default function App(): JSX.Element {
  useKeepAwake();
  const [screen, setScreen] = useState<Screen>("home");
  const [budget, setBudget] = useState<number>(900);
  const [thread, setThread] = useState<Thread>("all");
  const [intense, setIntense] = useState<boolean>(false);
  const [kidsOnly, setKidsOnly] = useState<boolean>(false);
  const [sceneIdx, setSceneIdx] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(false);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [cutElapsed, setCutElapsed] = useState<number>(0);
  const [jumpToast, setJumpToast] = useState<string | null>(null);

  const videoRef = useRef<VideoRef>(null);
  const lastSceneRef = useRef<number>(-1);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const route = useMemo(
    () => buildRoute(SCENES, budget, { thread, mood: intense ? "intense" : null, kidsOnly }),
    [budget, thread, intense, kidsOnly],
  );

  const routeKey = useMemo(() => route.ids.join(","), [route.ids]);
  useEffect(() => {
    setSceneIdx(0);
    setCutElapsed(0);
    lastSceneRef.current = -1;
  }, [routeKey]);

  const goNext = useCallback(() => {
    setSceneIdx((i) => Math.min(Math.max(route.scenes.length - 1, 0), i + 1));
  }, [route.scenes.length]);

  const goPrev = useCallback(() => {
    setSceneIdx((i) => Math.max(0, i - 1));
  }, []);

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  useEffect(() => {
    const payload: PersistedState = { budget, thread, intense, kidsOnly };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => undefined);
  }, [budget, thread, intense, kidsOnly]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (!v || !mounted) return;
        try {
          const p = JSON.parse(v) as PersistedState;
          if (typeof p.budget === "number") setBudget(p.budget);
          if (p.thread === "all" || p.thread === "mystery" || p.thread === "heart" || p.thread === "chase")
            setThread(p.thread);
          setIntense(Boolean(p.intense));
          setKidsOnly(Boolean(p.kidsOnly));
        } catch {
          // keep defaults on corrupt storage
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const onTVEvent = useCallback(
    (evt: TVRemoteEvent) => {
      if (evt.eventType === "playPause" && screen === "play") togglePlay();
      else if (evt.eventType === "next" || evt.eventType === "fastForward") goNext();
      else if (evt.eventType === "previous" || evt.eventType === "rewind") goPrev();
      else if (evt.eventType === "menu" && screen === "play") setScreen("choose");
    },
    [screen, togglePlay, goNext, goPrev],
  );
  useTVEventHandler(onTVEvent);

  // FireOS remote Back button should navigate back instead of exiting.
  useEffect(() => {
    if (!isFireOS) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "play") {
        setScreen("choose");
        return true;
      }
      if (screen === "choose") {
        setScreen("home");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  const openOTT = useCallback(async (id: string): Promise<void> => {
    const p = OTT_PROVIDERS.find((x) => x.id === id);
    if (!p) return;
    try {
      const ok = await Linking.canOpenURL(p.app);
      await Linking.openURL(ok ? p.app : p.web);
    } catch {
      try {
        await Linking.openURL(p.web);
      } catch {
        /* no-op */
      }
    }
  }, []);

  const cur = route.scenes[sceneIdx] ?? null;

  // Proportional time mapping between 52:14 episode and sample video
  const mapToVideo = useCallback(
    (epSec: number): number => {
      if (!videoDuration || videoDuration <= 0) return epSec;
      return (epSec / EPISODE.durationSec) * videoDuration;
    },
    [videoDuration],
  );

  const mapToEpisode = useCallback(
    (vidSec: number): number => {
      if (!videoDuration || videoDuration <= 0) return vidSec;
      return (vidSec / videoDuration) * EPISODE.durationSec;
    },
    [videoDuration],
  );

  // Seek video when scene changes
  const seekToScene = useCallback(
    (idx: number) => {
      const scene = route.scenes[idx];
      if (!scene || !videoRef.current) return;
      const targetVid = mapToVideo(scene.start);
      try {
        videoRef.current.seek(targetVid);
      } catch {
        // seek error safety
      }

      // Detect non-sequential jumps (jump cut toast)
      const prevIdx = lastSceneRef.current;
      if (prevIdx >= 0 && idx !== prevIdx + 1 && idx !== prevIdx) {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setJumpToast(`✂ CUTLINE JUMP · ${scene.title}`);
        toastTimeoutRef.current = setTimeout(() => {
          setJumpToast(null);
        }, 2500);
      }
      lastSceneRef.current = idx;
    },
    [route.scenes, mapToVideo],
  );

  useEffect(() => {
    if (screen === "play" && cur) {
      seekToScene(sceneIdx);
    }
  }, [sceneIdx, screen, seekToScene, cur]);

  const onLoad = useCallback(
    (data: OnLoadData) => {
      setVideoDuration(data.duration);
      if (cur && videoRef.current) {
        const targetVid = data.duration > 0 ? (cur.start / EPISODE.durationSec) * data.duration : cur.start;
        videoRef.current.seek(targetVid);
      }
    },
    [cur],
  );

  const onProgress = useCallback(
    (data: OnProgressData) => {
      if (!cur || !playing || screen !== "play") return;
      const endVid = mapToVideo(cur.end);

      // Advance scene when current scene segment finishes
      if (endVid > 0 && data.currentTime >= endVid - 0.2) {
        if (sceneIdx < route.scenes.length - 1) {
          goNext();
        } else {
          setPlaying(false);
        }
      }

      // Compute total elapsed cut time
      let prevScenesDur = 0;
      for (let i = 0; i < sceneIdx; i++) {
        const s = route.scenes[i];
        prevScenesDur += s.end - s.start;
      }
      const epCurrent = mapToEpisode(data.currentTime);
      const currentSceneSec = Math.max(0, Math.min(cur.end, epCurrent) - cur.start);
      setCutElapsed(prevScenesDur + currentSceneSec);
    },
    [cur, playing, screen, mapToVideo, mapToEpisode, sceneIdx, route.scenes, goNext],
  );

  const onVideoEnd = useCallback(() => {
    if (sceneIdx < route.scenes.length - 1) {
      goNext();
    } else {
      setPlaying(false);
    }
  }, [sceneIdx, route.scenes.length, goNext]);

  return (
    <View style={s.root}>
      <View style={s.sysbar}>
        <Text style={s.sysBadge}>FIRE TV</Text>
        <Text style={s.sysText}>
          CUTLINE · {EPISODE.title} · {EPISODE.durationLabel}
        </Text>
        <View style={s.nav}>
          {(["home", "choose", "play"] as Screen[]).map((t) => (
            <TVButton key={t} title={t.toUpperCase()} active={screen === t} onPress={() => setScreen(t)} />
          ))}
        </View>
      </View>

      {screen === "home" && (
        <View style={s.hero}>
          <Text style={s.eyebrow}>FIRE TV · FIREOS · 10-FOOT</Text>
          <Text style={s.h1}>The 52-minute episode, cut to what matters.</Text>
          <Text style={s.sub}>
            Pick a time, press OK. Story holds. {fmt(EPISODE.durationSec - route.totalDuration)} saved.
          </Text>
          <View style={s.row}>
            {BUDGETS.map((b) => (
              <TVButton
                key={b}
                title={b >= FULL_BUDGET ? "FULL" : fmt(b)}
                active={budget === b}
                onPress={() => {
                  setBudget(b);
                  setScreen("choose");
                }}
                preferred={b === 900}
              />
            ))}
          </View>
          <View style={s.row}>
            {OTT_PROVIDERS.map((p) => (
              <TVButton key={p.id} title={"Open " + p.name} onPress={() => openOTT(p.id)} />
            ))}
          </View>
        </View>
      )}

      {screen === "choose" && (
        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.h2}>TIME</Text>
            <View style={s.row}>
              {BUDGETS.map((b) => (
                <TVButton
                  key={b}
                  title={b >= FULL_BUDGET ? "FULL" : fmt(b)}
                  active={budget === b}
                  onPress={() => setBudget(b)}
                />
              ))}
            </View>
            <Text style={s.h2}>THREAD</Text>
            <View style={s.row}>
              {(["all", "mystery", "heart", "chase"] as Thread[]).map((t) => (
                <TVButton key={t} title={t} active={thread === t} onPress={() => setThread(t)} />
              ))}
            </View>
            <View style={s.row}>
              <TVButton
                title={intense ? "INTENSE: on" : "INTENSE: off"}
                active={intense}
                onPress={() => setIntense(!intense)}
              />
              <TVButton
                title={kidsOnly ? "KIDS: on" : "KIDS: off"}
                active={kidsOnly}
                onPress={() => setKidsOnly(!kidsOnly)}
              />
            </View>
            <TVButton
              title={"▶ PLAY " + fmt(route.totalDuration) + " CUT"}
              preferred
              onPress={() => {
                setSceneIdx(0);
                setPlaying(true);
                setScreen("play");
              }}
            />
          </View>
          <View style={s.col}>
            <Text style={s.h2}>
              {route.scenes.length} SCENES · {fmt(route.totalDuration)} · {Math.round(route.coverage * 100)}% KEPT
            </Text>
            <FlatList
              data={route.scenes}
              keyExtractor={(x) => x.id}
              renderItem={({ item, index }) => (
                <View style={s.routeRow}>
                  <Text style={s.rng}>{fmtRange(item)}</Text>
                  <Text style={s.ttl}>
                    {index + 1}. {item.title}
                  </Text>
                </View>
              )}
            />
          </View>
        </View>
      )}

      {screen === "play" && (
        <View style={s.cols}>
          <View style={s.col}>
            <View style={s.videoWrap}>
              <Video
                ref={videoRef}
                source={{ uri: DEMO_VIDEO }}
                style={s.video}
                resizeMode="contain"
                paused={!playing}
                controls={!isTV}
                preventsDisplaySleepDuringVideoPlayback
                onLoad={onLoad}
                onProgress={onProgress}
                onEnd={onVideoEnd}
                onError={(e) => console.warn("[cutline] video error", e.error)}
              />
              {jumpToast && (
                <View style={s.toast}>
                  <Text style={s.toastT}>{jumpToast}</Text>
                </View>
              )}
            </View>

            {/* Cut countdown & progress */}
            <View style={s.progressWrap}>
              <View style={s.progressBar}>
                <View
                  style={[
                    s.progressFill,
                    {
                      width: `${Math.min(100, (cutElapsed / Math.max(1, route.totalDuration)) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={s.progressText}>
                Cut elapsed {fmt(cutElapsed)} / {fmt(route.totalDuration)} · Remaining{" "}
                {fmt(Math.max(0, route.totalDuration - cutElapsed))} · Scene {sceneIdx + 1} of {route.scenes.length}
              </Text>
            </View>

            <Text style={s.h2}>{cur ? `${fmtRange(cur)} · ${cur.title}` : "—"}</Text>
            <Text style={s.sub}>{cur?.synopsis ?? ""}</Text>
            <View style={s.row}>
              <TVButton title="‹ Back" onPress={() => setScreen("choose")} />
              <TVButton title="⏮ Prev" onPress={() => setSceneIdx((i) => Math.max(0, i - 1))} />
              <TVButton
                title={playing ? "⏸ Pause" : "▶ Play"}
                preferred
                active
                onPress={() => setPlaying(!playing)}
              />
              <TVButton title="Next ⏭" onPress={() => setSceneIdx((i) => Math.min(route.scenes.length - 1, i + 1))} />
            </View>
          </View>
          <View style={s.col}>
            <Text style={s.h2}>UP NEXT IN THIS CUT</Text>
            <FlatList
              data={route.scenes}
              keyExtractor={(x) => x.id}
              renderItem={({ item, index }) => (
                <TouchableOpacity hasTVPreferredFocus={index === sceneIdx} onPress={() => setSceneIdx(index)}>
                  <View style={[s.routeRow, index === sceneIdx && s.now]}>
                    <Text style={s.rng}>{fmtRange(item)}</Text>
                    <Text style={s.ttl}>{item.title}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      )}
    </View>
  );
}

type TVButtonProps = {
  title: string;
  onPress: () => void;
  active?: boolean;
  preferred?: boolean;
};

function TVButton({ title, onPress, active, preferred }: TVButtonProps): JSX.Element {
  const [focused, setFocused] = useState<boolean>(false);
  return (
    <TouchableOpacity
      hasTVPreferredFocus={preferred === true}
      tvParallaxProperties={{ magnification: 1.08 }}
      accessible
      accessibilityRole="button"
      accessibilityState={{ selected: active === true }}
      activeOpacity={0.7}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[s.btn, active === true && s.btnActive, focused && s.btnFocused]}
    >
      <Text style={[s.btnT, active === true && s.btnTActive]}>{title}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080b14", padding: 28 },
  sysbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    paddingBottom: 12,
  },
  sysBadge: {
    color: "#94a3b8",
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 12,
    letterSpacing: 2,
  },
  sysText: { color: "#94a3b8", fontSize: 13, letterSpacing: 1 },
  nav: { marginLeft: "auto", flexDirection: "row", gap: 8 },
  hero: { paddingVertical: 28, gap: 14 },
  eyebrow: { color: "#94a3b8", fontSize: 12, letterSpacing: 2 },
  h1: { color: "#f1f5f9", fontSize: 40, fontWeight: "800", letterSpacing: -1 },
  h2: { color: "#c9a86a", fontSize: 15, letterSpacing: 1.5, marginVertical: 10, fontWeight: "700" },
  sub: { color: "#94a3b8", fontSize: 17, maxWidth: 900 },
  row: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginVertical: 8 },
  cols: { flex: 1, flexDirection: "row", gap: 24, marginTop: 12 },
  col: { flex: 1 },
  btn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: 56,
    justifyContent: "center",
  },
  btnActive: { borderColor: "#c9a86a", backgroundColor: "rgba(201,168,106,0.14)" },
  btnFocused: { borderColor: "#fff", shadowColor: "#c9a86a", shadowRadius: 8 },
  btnT: { color: "#e2e8f0", fontSize: 16, fontWeight: "600" },
  btnTActive: { color: "#fff" },
  routeRow: {
    flexDirection: "row",
    gap: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: "#0e1426",
  },
  now: { borderColor: "#c9a86a" },
  rng: { color: "#7dd3fc", fontVariant: ["tabular-nums"] },
  ttl: { color: "#f1f5f9", fontWeight: "600" },
  videoWrap: { position: "relative", width: "100%", aspectRatio: 16 / 9 },
  video: { width: "100%", height: "100%", backgroundColor: "#000", borderRadius: 10 },
  toast: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "rgba(14, 20, 38, 0.92)",
    borderColor: "#c9a86a",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toastT: { color: "#c9a86a", fontWeight: "700", fontSize: 13, letterSpacing: 1 },
  progressWrap: { marginTop: 10, marginBottom: 4 },
  progressBar: {
    height: 6,
    backgroundColor: "#1e293b",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressFill: { height: "100%", backgroundColor: "#7dd3fc" },
  progressText: { color: "#94a3b8", fontSize: 13, fontVariant: ["tabular-nums"] },
});
