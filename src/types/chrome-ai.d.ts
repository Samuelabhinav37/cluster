export {};

// Chrome's built-in on-device Summarizer API (chrome.dev/docs/ai/summarizer-api).
// Not part of TypeScript's DOM lib yet, so declared minimally here for just
// what aiDigest.ts uses.
declare global {
  type SummarizerAvailability = "unavailable" | "downloadable" | "downloading" | "available";

  interface SummarizerDownloadProgressEvent extends Event {
    loaded: number;
  }

  interface SummarizerMonitor extends EventTarget {
    addEventListener(
      type: "downloadprogress",
      listener: (event: SummarizerDownloadProgressEvent) => void,
    ): void;
  }

  interface SummarizerCreateOptions {
    type?: "tldr" | "key-points" | "teaser" | "headline";
    format?: "plain-text" | "markdown";
    length?: "short" | "medium" | "long";
    sharedContext?: string;
    monitor?(monitor: SummarizerMonitor): void;
  }

  interface SummarizerInstance {
    summarize(input: string, options?: { context?: string }): Promise<string>;
    destroy(): void;
  }

  const Summarizer: {
    availability(): Promise<SummarizerAvailability>;
    create(options?: SummarizerCreateOptions): Promise<SummarizerInstance>;
  };
}
