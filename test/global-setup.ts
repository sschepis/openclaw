/**
 * Global setup for vitest - runs once before any tests.
 * This is the only place to add polyfills that need to be available
 * before module loading in forked test processes.
 */

// Polyfill File global for node-fetch/undici compatibility
if (typeof globalThis.File === "undefined") {
  // @ts-expect-error - minimal File mock for undici compatibility
  globalThis.File = class File {
    name: string;
    type: string;
    size: number;
    lastModified: number;
    constructor(bits: unknown[], name: string, options?: { type?: string; lastModified?: number }) {
      this.name = name;
      this.type = options?.type || "";
      this.size = bits.reduce(
        (acc: number, b: unknown) => acc + ((b as { length?: number }).length || 0),
        0,
      );
      this.lastModified = options?.lastModified || Date.now();
    }
  };
}

export async function setup() {
  // Polyfills are applied when this module loads
  console.log("[global-setup] File polyfill installed");
}

export async function teardown() {
  // Nothing to clean up
}
