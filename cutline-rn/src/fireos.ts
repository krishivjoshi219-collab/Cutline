/**
 * FireOS helpers for Cutline RN (react-native-tvos, TypeScript).
 * Pure TS — no native deps — safe to import on phone for debugging.
 */
import { Platform } from "react-native";

export const isTV = Platform.isTV === true;
export const isFireOS = Platform.OS === "android" && isTV;

export const FIRE_TV_MODEL_HINTS = ["AFT", "Fire TV", "Fire OS", "KFSUWI"] as const;

export function isFireTVUserAgent(ua: string): boolean {
  return /AFT|AFTM|AFTT|Fire TV|Fire OS|KFSUWI|Silk-Accelerated/i.test(ua ?? "");
}

export type FireRemoteEvent =
  | "playPause"
  | "next"
  | "previous"
  | "fastForward"
  | "rewind"
  | "menu"
  | "select";

export function shouldTogglePlay(eventType: string, screen: string): boolean {
  return eventType === "playPause" && screen === "play";
}
