// Types for skyEngine.js (the portfolio's night sky). Importing the module
// for its side effect defines window.SiteSky.

export type SkyMessage =
  | { type: "size"; w: number; h: number; dpr: number }
  | { type: "running"; on: boolean }
  | { type: "tone"; name: string };

export interface SkyEngine {
  handle(msg: SkyMessage): void;
  hasGL: boolean;
}

declare global {
  interface Window {
    SiteSky: {
      create(sky: HTMLCanvasElement, fx: HTMLCanvasElement, opts: { tier: "full" | "lite" | "still"; tone?: string }): SkyEngine;
    };
  }
}
