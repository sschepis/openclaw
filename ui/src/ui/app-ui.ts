import { callDebugMethod } from "./controllers/debug";
import type { OpenClawApp } from "./app";
import type { LogLevel } from "./types";

type App = OpenClawApp & {
  settingsOpen: boolean;
  sidebarOpen: boolean;
  sidebarContent: string | null;
  sidebarError: string | null;
  sidebarCloseTimer: number | null;
  splitRatio: number;
  applySettings: (settings: any) => void;
  settings: any;
  logsFilterText: string;
  logsLevelFilters: Record<LogLevel, boolean>;
  logsAutoFollow: boolean;
  debugCallMethod: string;
  debugCallParams: string;
  chatQueue: any[];
  removeQueuedMessage: (id: string) => void;
  execApprovalQueue: any[];
  execApprovalBusy: boolean;
  execApprovalError: string | null;
  client: any;
  pendingGatewayUrl: string | null;
  connect: () => void;
};

export function handleToggleSettings(app: App) {
  app.settingsOpen = !app.settingsOpen;
  if (app.settingsOpen) {
    void app.loadCron();
  }
}

export async function handleExecApprovalDecision(app: App, decision: "allow-once" | "allow-always" | "deny") {
  const active = app.execApprovalQueue[0];
  if (!active || !app.client || app.execApprovalBusy) {
    return;
  }
  app.execApprovalBusy = true;
  app.execApprovalError = null;
  try {
    await app.client.request("exec.approval.resolve", {
      id: active.id,
      decision,
    });
    app.execApprovalQueue = app.execApprovalQueue.filter((entry) => entry.id !== active.id);
  } catch (err) {
    app.execApprovalError = `Exec approval failed: ${String(err)}`;
  } finally {
    app.execApprovalBusy = false;
  }
}

export function handleGatewayUrlConfirm(app: App) {
  const nextGatewayUrl = app.pendingGatewayUrl;
  if (!nextGatewayUrl) {
    return;
  }
  app.pendingGatewayUrl = null;
  app.applySettings({
    ...app.settings,
    gatewayUrl: nextGatewayUrl,
  });
  app.connect();
}

export function handleGatewayUrlCancel(app: App) {
  app.pendingGatewayUrl = null;
}

export function handleOpenSidebar(app: App, content: string) {
  if (app.sidebarCloseTimer != null) {
    window.clearTimeout(app.sidebarCloseTimer);
    app.sidebarCloseTimer = null;
  }
  app.sidebarContent = content;
  app.sidebarError = null;
  app.sidebarOpen = true;
}

export function handleCloseSidebar(app: App) {
  app.sidebarOpen = false;
  // Clear content after transition
  if (app.sidebarCloseTimer != null) {
    window.clearTimeout(app.sidebarCloseTimer);
  }
  app.sidebarCloseTimer = window.setTimeout(() => {
    if (app.sidebarOpen) {
      return;
    }
    app.sidebarContent = null;
    app.sidebarError = null;
    app.sidebarCloseTimer = null;
  }, 200);
}

export function handleSplitRatioChange(app: App, ratio: number) {
  const newRatio = Math.max(0.4, Math.min(0.7, ratio));
  app.splitRatio = newRatio;
  app.applySettings({ ...app.settings, splitRatio: newRatio });
}

export function handleChatSelectQueueItem(app: App, id: string) {
  // No-op for now
}

export function handleChatDropQueueItem(app: App, id: string) {
  app.removeQueuedMessage(id);
}

export function handleChatClearQueue(app: App) {
  app.chatQueue = [];
}

export function handleLogsFilterChange(app: App, next: string) {
  app.logsFilterText = next;
}

export function handleLogsLevelFilterToggle(app: App, level: LogLevel) {
  app.logsLevelFilters = {
    ...app.logsLevelFilters,
    [level]: !app.logsLevelFilters[level],
  };
}

export function handleLogsAutoFollowToggle(app: App, next: boolean) {
  app.logsAutoFollow = next;
}

export async function handleCallDebugMethod(app: App, method: string, params: string) {
  app.debugCallMethod = method;
  app.debugCallParams = params;
  await callDebugMethod(app as any);
}
