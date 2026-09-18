import type { Scene } from "./solver";
import scenesData from "./scenes.json";

// Single scene index, colocated so Metro bundles it with no extra config.
export const EPISODE = { ...scenesData.episode, demoVideo: scenesData.demoVideo };
export const SCENES: Scene[] = scenesData.scenes;
export const DEMO_VIDEO: string = scenesData.demoVideo.sources[0] ?? "";
export const OTT_PROVIDERS = [
  { id: "prime", name: "Prime Video", app: "amzn://apps/android?p=com.amazon.avod", web: "https://app.primevideo.com" },
  { id: "netflix", name: "Netflix", app: "amzn://apps/android?p=com.netflix.ninja", web: "https://www.netflix.com" },
  {
    id: "disney",
    name: "Disney+",
    app: "amzn://apps/android?p=com.disney.disneyplus",
    web: "https://www.disneyplus.com",
  },
  { id: "max", name: "Max", app: "amzn://apps/android?p=com.wbd.stream", web: "https://play.max.com" },
];
