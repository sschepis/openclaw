import type { OpenClawApp } from "./app";
import type { GatewaySessionRow, SessionsListResult } from "./types";
import { refreshChatAvatar } from "./app-chat";
import { loadChatHistory, fetchChatHistory } from "./controllers/chat";
import { loadSessions, patchSession } from "./controllers/sessions";
import { generateUUID } from "./uuid";

// We need to access the app instance with extended props to call its methods/update state
// since we are moving logic out of the class.
/* eslint-disable @typescript-eslint/no-explicit-any */
type App = OpenClawApp & {
  sessionKey: string;
  chatMessage: string;
  chatAttachments: any[];
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  chatRunId: string | null;
  chatQueue: any[];
  chatMessages: unknown[];
  sessionsResult: SessionsListResult | null;
  resetToolStream: () => void;
  resetChatScroll: () => void;
  applySettings: (settings: any) => void;
  settings: any;
  loadAssistantIdentity: () => Promise<void>;
  client: any;
  addActionMessage?: (action: any) => void;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Options for spawning a new session.
 */
export type SpawnSessionOptions = {
  /** If true, clone the history from the source session. Default: false (blank session) */
  clone?: boolean;
  /** The source session key to clone from. Default: current session */
  sourceSessionKey?: string;
  /** If true, switch focus to the new session. Default: false */
  switchFocus?: boolean;
  /** Optional display name for the new session */
  displayName?: string;
};

/**
 * Result of spawning a new session.
 */
export type SpawnSessionResult = {
  success: boolean;
  sessionKey?: string;
  error?: string;
};

export async function handleNewSession(app: App) {
  const next = generateUUID();

  // Create a new session row to add to the sessions list immediately
  const newSessionRow: GatewaySessionRow = {
    key: next,
    kind: "direct",
    displayName: "New Session",
    updatedAt: Date.now(),
  };

  // Optimistically add the new session to the list at the top
  if (app.sessionsResult) {
    app.sessionsResult = {
      ...app.sessionsResult,
      count: app.sessionsResult.count + 1,
      sessions: [newSessionRow, ...app.sessionsResult.sessions],
    };
  } else {
    app.sessionsResult = {
      ts: Date.now(),
      path: "",
      count: 1,
      defaults: { model: null, contextTokens: null },
      sessions: [newSessionRow],
    };
  }

  // Update the active session
  app.sessionKey = next;
  app.chatMessage = "";
  app.chatAttachments = [];
  app.chatStream = null;
  app.chatStreamStartedAt = null;
  app.chatRunId = null;
  app.chatQueue = [];
  app.chatMessages = [];
  app.resetToolStream();
  app.resetChatScroll();
  app.applySettings({
    ...app.settings,
    sessionKey: next,
    lastActiveSessionKey: next,
  });
  await app.loadAssistantIdentity();
  await loadChatHistory(app as Parameters<typeof loadChatHistory>[0]);
  await refreshChatAvatar(app as Parameters<typeof refreshChatAvatar>[0]);
}

/**
 * Spawns a new session, optionally cloning from an existing session.
 * By default, the new session is created in the background without switching focus.
 *
 * @param app - The app instance
 * @param options - Options for spawning the session
 * @returns Result of the spawn operation
 */
export async function spawnSession(
  app: App,
  options: SpawnSessionOptions = {},
): Promise<SpawnSessionResult> {
  const {
    clone = false,
    sourceSessionKey = app.sessionKey,
    switchFocus = false,
    displayName,
  } = options;

  if (!app.client) {
    return { success: false, error: "Not connected to gateway" };
  }

  try {
    // Generate a new session key
    const newSessionKey = generateUUID();
    const now = Date.now();

    // Determine the display name for the new session
    let resolvedDisplayName = displayName;
    if (!resolvedDisplayName) {
      if (clone) {
        // Find the source session's display name
        const sourceSession = app.sessionsResult?.sessions?.find((s) => s.key === sourceSessionKey);
        const sourceDisplayName = sourceSession?.displayName ?? sourceSessionKey;
        resolvedDisplayName = `Clone of ${sourceDisplayName}`;
      } else {
        resolvedDisplayName = "New Session";
      }
    }

    // Create a new session row to add to the sessions list immediately
    const newSessionRow: GatewaySessionRow = {
      key: newSessionKey,
      kind: "direct",
      displayName: resolvedDisplayName,
      updatedAt: now,
    };

    // If cloning, we need to copy history from the source session
    if (clone) {
      // Fetch the source session's history
      const sourceHistory = await fetchChatHistory(app.client, sourceSessionKey);

      if (sourceHistory && sourceHistory.length > 0) {
        // Use the gateway to clone/import history to the new session
        // This requires a sessions.clone or chat.import API call
        try {
          await app.client.request("sessions.clone", {
            sourceKey: sourceSessionKey,
            targetKey: newSessionKey,
            label: resolvedDisplayName,
          });
        } catch (cloneErr) {
          // If sessions.clone is not available, fall back to creating a blank session
          // and notify the user that cloning is not supported
          console.warn("sessions.clone not available, creating blank session:", cloneErr);
        }
      }
    }

    // Optimistically add the new session to the list
    if (app.sessionsResult) {
      app.sessionsResult = {
        ...app.sessionsResult,
        count: app.sessionsResult.count + 1,
        sessions: [newSessionRow, ...app.sessionsResult.sessions],
      };
    } else {
      app.sessionsResult = {
        ts: now,
        path: "",
        count: 1,
        defaults: { model: null, contextTokens: null },
        sessions: [newSessionRow],
      };
    }

    // Notify the user about the new session via action message
    if (app.addActionMessage) {
      app.addActionMessage({
        type: "session-spawned",
        title: clone ? "Session Cloned" : "Session Created",
        description: `Created "${resolvedDisplayName}"${switchFocus ? " and switched to it" : " in the background"}`,
        timestamp: now,
        data: { sessionKey: newSessionKey, clone, switchFocus },
      });
    }

    // If switchFocus is true, switch to the new session
    if (switchFocus) {
      app.sessionKey = newSessionKey;
      app.chatMessage = "";
      app.chatAttachments = [];
      app.chatStream = null;
      app.chatStreamStartedAt = null;
      app.chatRunId = null;
      app.chatQueue = [];
      app.chatMessages = [];
      app.resetToolStream();
      app.resetChatScroll();
      app.applySettings({
        ...app.settings,
        sessionKey: newSessionKey,
        lastActiveSessionKey: newSessionKey,
      });
      await app.loadAssistantIdentity();
      await loadChatHistory(app as Parameters<typeof loadChatHistory>[0]);
      await refreshChatAvatar(app as Parameters<typeof refreshChatAvatar>[0]);
    } else {
      // Just refresh the sessions list to ensure the new session appears
      await loadSessions(app as Parameters<typeof loadSessions>[0]);
    }

    return { success: true, sessionKey: newSessionKey };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMessage };
  }
}

/**
 * Spawns a blank session (convenience wrapper around spawnSession).
 */
export async function spawnBlankSession(
  app: App,
  options: { switchFocus?: boolean; displayName?: string } = {},
): Promise<SpawnSessionResult> {
  return spawnSession(app, {
    clone: false,
    switchFocus: options.switchFocus ?? false,
    displayName: options.displayName,
  });
}

/**
 * Spawns a clone of the current session (convenience wrapper around spawnSession).
 */
export async function spawnCloneSession(
  app: App,
  options: { sourceSessionKey?: string; switchFocus?: boolean; displayName?: string } = {},
): Promise<SpawnSessionResult> {
  return spawnSession(app, {
    clone: true,
    sourceSessionKey: options.sourceSessionKey,
    switchFocus: options.switchFocus ?? false,
    displayName: options.displayName,
  });
}

export async function handleExportSession(app: App, key: string) {
  if (!app.client) {
    return;
  }
  const history = await fetchChatHistory(app.client, key);
  if (!history || history.length === 0) {
    alert("No history to export.");
    return;
  }

  const data = JSON.stringify(history, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `session-${key}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleSessionsPatch(app: App, key: string, patch: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await patchSession(app as any, key, patch);
}
