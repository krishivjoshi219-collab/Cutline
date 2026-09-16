import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Linking,
  Platform,
  useTVEventHandler,
  BackHandler,
} from "react-native";
import type { TVEvent } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Video, { type VideoRef } from "react-native-video";
import { useKeepAwake } from "react-native-keep-awake";
import { buildRoute, fmt, fmtRange, type Thread } from "./src/solver";
import { EPISODE, SCENES, DEMO_VIDEO, OTT_PROVIDERS } from "./src/data";

type Screen = "home" | "choose" | "play";

const BUDGETS = [300, 900, 1800, 3134] as const;
const STORAGE_KEY = "cutline:rn:v1";
const FULL_BUDGET = 3134;

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
  const videoRef = useRef<VideoRef>(null);

  const route = useMemo(
    () => buildRoute(SCENES, budget, { thread, mood: intense ? "intense" : null, kidsOnly }),
    [budget, thread, intense, kidsOnly]
  );

  const routeKey = useMemo(() => route.ids.join(","), [route.ids]);
  useEffect(() => { setSceneIdx(0); }, [routeKey]);

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
          if (p.thread === "all" || p.thread === "mystery" || p.thread === "heart" || p.thread === "chase") setThread(p.thread);
          setIntense(Boolean(p.intense));
          setKidsOnly(Boolean(p.kidsOnly));
        } catch {
          // keep defaults on corrupt storage
        }
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const onTVEvent = useCallback(
    (evt: TVEvent) => {
      if (evt.eventType === "playPause" && screen === "play") togglePlay();
      else if (evt.eventType === "next" || evt.eventType === "fastForward") goNext();
      else if (evt.eventType === "previous" || evt.eventType === "rewind") goPrev();
      else if (evt.eventType === "menu" && screen === "play") setScreen("choose");
    },
    [screen, togglePlay, goNext, goPrev]
  );
  useTVEventHandler(onTVEvent);

  // FireOS remote Back button should navigate back instead of exiting.
  useEffect(() => {
    if (!isFireOS) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "play") { setScreen("choose"); return true; }
      if (screen === "choose") { setScreen("home"); return true; }
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
      try { await Linking.openURL(p.web); } catch { /* no-op */ }
    }
  }, []);

  const cur = route.scenes[sceneIdx] ?? null;
  const onVideoEnd = useCallback(() => { goNext(); }, [goNext]);

  return (
    <View style={s.root}>
      <View style={s.sysbar}>
        <Text style={s.sysBadge}>FIRE TV</Text>
        <Text style={s.sysText}>CUTLINE · {EPISODE.title} · {EPISODE.durationLabel}</Text>
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
          <Text style={s.sub}>Pick a time, press OK. Story holds. {fmt(EPISODE.durationSec - route.totalDuration)} saved.</Text>
          <View style={s.row}>
            {BUDGETS.map((b) => (
              <TVButton key={b} title={b >= 3134 ? "FULL" : fmt(b)} active={budget === b} onPress={() => { setBudget(b); setScreen("choose"); }} preferred={b === 900} />
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
                <TVButton key={b} title={b >= 3134 ? "FULL" : fmt(b)} active={budget === b} onPress={() => setBudget(b)} />
              ))}
            </View>
            <Text style={s.h2}>THREAD</Text>
            <View style={s.row}>
              {(["all", "mystery", "heart", "chase"] as Thread[]).map((t) => (
                <TVButton key={t} title={t} active={thread === t} onPress={() => setThread(t)} />
              ))}
            </View>
            <View style={s.row}>
              <TVButton title={intense ? "INTENSE: on" : "INTENSE: off"} active={intense} onPress={() => setIntense(!intense)} />
              <TVButton title={kidsOnly ? "KIDS: on" : "KIDS: off"} active={kidsOnly} onPress={() => setKidsOnly(!kidsOnly)} />
            </View>
            <TVButton title={"▶ PLAY " + fmt(route.totalDuration) + " CUT"} preferred onPress={() => { setSceneIdx(0); setPlaying(true); setScreen("play"); }} />
          </View>
          <View style={s.col}>
            <Text style={s.h2}>{route.scenes.length} SCENES · {fmt(route.totalDuration)} · {Math.round(route.coverage * 100)}% KEPT</Text>
            <FlatList
              data={route.scenes}
              keyExtractor={(x) => x.id}
              renderItem={({ item, index }) => (
                <View style={s.routeRow}>
                  <Text style={s.rng}>{fmtRange(item)}</Text>
                  <Text style={s.ttl}>{index + 1}. {item.title}</Text>
                </View>
              )}
            />
          </View>
        </View>
      )}

      {screen === "play" && (
        <View style={s.cols}>
          <View style={s.col}>
            <Video
              ref={videoRef}
              source={{ uri: DEMO_VIDEO }}
              style={s.video}
              resizeMode="contain"
              paused={!playing}
              controls={!isTV}
              preventsDisplaySleepDuringVideoPlayback
              onEnd={onVideoEnd}
              onError={(e) => console.warn("[cutline] video error", e.error)}
            />
            <Text style={s.h2}>{cur ? `${fmtRange(cur)} · ${cur.title}` : "—"}</Text>
            <Text style={s.sub}>{cur?.synopsis ?? ""}</Text>
            <View style={s.row}>
              <TVButton title="‹ Back" onPress={() => setScreen("choose")} />
              <TVButton title="⏮ Prev" onPress={() => setSceneIdx((i) => Math.max(0, i - 1))} />
              <TVButton title={playing ? "⏸ Pause" : "▶ Play"} preferred active onPress={() => setPlaying(!playing)} />
              <TVButton title="Next ⏭" onPress={() => setSceneIdx((i) => Math.min(route.scenes.length - 1, i + 1))} />
            </View>
          </View>
          <View style={s.col}>
            <Text style={s.h2}>UP NEXT</Text>
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
  sysbar: { flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#1e293b", paddingBottom: 12 },
  sysBadge: { color: "#94a3b8", borderWidth: 1, borderColor: "#334155", paddingHorizontal: 8, paddingVertical: 2, fontSize: 12, letterSpacing: 2 },
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
  btn: { borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12, minHeight: 56, justifyContent: "center" },
  btnActive: { borderColor: "#c9a86a", backgroundColor: "rgba(201,168,106,0.14)" },
  btnT: { color: "#e2e8f0", fontSize: 16, fontWeight: "600" },
  btnTActive: { color: "#fff" },
  routeRow: { flexDirection: "row", gap: 12, padding: 10, borderWidth: 1, borderColor: "#1e293b", borderRadius: 8, marginBottom: 6, backgroundColor: "#0e1426" },
  now: { borderColor: "#c9a86a" },
  rng: { color: "#7dd3fc", fontVariant: ["tabular-nums"] },
  ttl: { color: "#f1f5f9", fontWeight: "600" },
  video: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000", borderRadius: 10 },
});
