import { generateUUID } from "./uuid";
import { setLastActiveSessionKey } from "./app-settings";
import { loadChatHistory, fetchChatHistory } from "./controllers/chat";
import { loadSessions, patchSession } from "./controllers/sessions";
import { refreshChatAvatar } from "./app-chat";
import type { OpenClawApp } from "./app";
import type { GatewaySessionRow, SessionsListResult } from "./types";

// We need to access the app instance as any to call its methods/update state
// since we are moving logic out of the class.
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
  await loadChatHistory(app as any);
  await refreshChatAvatar(app as any);
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

export async function handleSessionsPatch(app: App, key: string, patch: any) {
  await patchSession(app as any, key, patch);
}
