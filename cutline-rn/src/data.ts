import type { Scene } from "./solver";

// Colocated data source ensures Metro bundler bundles without monorepo resolution failures
let raw: any;
try {
  raw = require("./scenes.json");
} catch {
  raw = require("../../data/scenes.json");
}

export const EPISODE = { ...raw.episode, demoVideo: raw.demoVideo };
export const SCENES: Scene[] = raw.scenes;
export const DEMO_VIDEO: string = raw.demoVideo?.sources?.[0] ?? "";
export const OTT_PROVIDERS = [
  { id: "prime", name: "Prime Video", app: "amzn://apps/android?p=com.amazon.avod", web: "https://app.primevideo.com" },
  { id: "netflix", name: "Netflix", app: "amzn://apps/android?p=com.netflix.ninja", web: "https://www.netflix.com" },
  { id: "disney", name: "Disney+", app: "amzn://apps/android?p=com.disney.disneyplus", web: "https://www.disneyplus.com" },
  { id: "max", name: "Max", app: "amzn://apps/android?p=com.wbd.stream", web: "https://play.max.com" },
];
