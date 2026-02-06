const KEY = "openclaw.control.settings.v1";
const DRAFT_KEY_PREFIX = "openclaw.chat.draft.";

import type { ThemeMode } from "./theme";

export type UiSettings = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
  lastActiveSessionKey: string;
  theme: ThemeMode;
  chatFocusMode: boolean;
  chatShowThinking: boolean;
  chatHideCron: boolean;
  splitRatio: number; // Sidebar split ratio (0.4 to 0.7, default 0.6)
  navCollapsed: boolean; // Collapsible sidebar state
  navWidth: number; // Sidebar width in pixels (160 to 400, default 220)
  navGroupsCollapsed: Record<string, boolean>; // Which nav groups are collapsed
};

export function loadSettings(): UiSettings {
  const defaultUrl = (() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}`;
  })();

  const defaults: UiSettings = {
    gatewayUrl: defaultUrl,
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    chatHideCron: false,
    splitRatio: 0.6,
    navCollapsed: false,
    navWidth: 220,
    navGroupsCollapsed: {},
  };

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return {
      gatewayUrl:
        typeof parsed.gatewayUrl === "string" && parsed.gatewayUrl.trim()
          ? parsed.gatewayUrl.trim()
          : defaults.gatewayUrl,
      token: typeof parsed.token === "string" ? parsed.token : defaults.token,
      sessionKey:
        typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()
          ? parsed.sessionKey.trim()
          : defaults.sessionKey,
      lastActiveSessionKey:
        typeof parsed.lastActiveSessionKey === "string" && parsed.lastActiveSessionKey.trim()
          ? parsed.lastActiveSessionKey.trim()
          : (typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()) ||
            defaults.lastActiveSessionKey,
      theme:
        parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system"
          ? parsed.theme
          : defaults.theme,
      chatFocusMode:
        typeof parsed.chatFocusMode === "boolean" ? parsed.chatFocusMode : defaults.chatFocusMode,
      chatShowThinking:
        typeof parsed.chatShowThinking === "boolean"
          ? parsed.chatShowThinking
          : defaults.chatShowThinking,
      chatHideCron:
        typeof parsed.chatHideCron === "boolean" ? parsed.chatHideCron : defaults.chatHideCron,
      splitRatio:
        typeof parsed.splitRatio === "number" &&
        parsed.splitRatio >= 0.4 &&
        parsed.splitRatio <= 0.7
          ? parsed.splitRatio
          : defaults.splitRatio,
      navCollapsed:
        typeof parsed.navCollapsed === "boolean" ? parsed.navCollapsed : defaults.navCollapsed,
      navWidth:
        typeof parsed.navWidth === "number" && parsed.navWidth >= 160 && parsed.navWidth <= 400
          ? parsed.navWidth
          : defaults.navWidth,
      navGroupsCollapsed:
        typeof parsed.navGroupsCollapsed === "object" && parsed.navGroupsCollapsed !== null
          ? parsed.navGroupsCollapsed
          : defaults.navGroupsCollapsed,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(next: UiSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

/**
 * Saves a draft message for a specific session key to localStorage.
 * This allows users to navigate away and return without losing their in-progress message.
 */
export function saveDraft(sessionKey: string, draft: string) {
  const key = `${DRAFT_KEY_PREFIX}${sessionKey}`;
  if (!draft.trim()) {
    localStorage.removeItem(key);
    return;
  }
  try {
    localStorage.setItem(key, draft);
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}

/**
 * Loads a saved draft message for a specific session key from localStorage.
 * Returns an empty string if no draft exists.
 */
export function loadDraft(sessionKey: string): string {
  const key = `${DRAFT_KEY_PREFIX}${sessionKey}`;
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/**
 * Clears a saved draft for a specific session key from localStorage.
 * Called after a message is successfully sent.
 */
export function clearDraft(sessionKey: string) {
  const key = `${DRAFT_KEY_PREFIX}${sessionKey}`;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}
