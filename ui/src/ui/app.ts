import { LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { EventLogEntry } from "./app-events";
import type { DevicePairingList } from "./controllers/devices";
import type { ExecApprovalRequest } from "./controllers/exec-approval";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway";
import type { Tab } from "./navigation";
import type { ResolvedTheme, ThemeMode } from "./theme";
import type { ActionMessage } from "./types/chat-types";
import type {
  ActivitiesListResult,
  AgentsListResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form";
import {
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels";
import {
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
  handleDeleteMessage as handleDeleteMessageInternal,
  handleDeleteFromMessage as handleDeleteFromMessageInternal,
  handleRerunFromMessage as handleRerunFromMessageInternal,
  handleEditMessage as handleEditMessageInternal,
} from "./app-chat";
import { callDebugMethod } from "./controllers/debug";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults";
import { connectGateway as connectGatewayInternal } from "./app-gateway";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle";
import { renderApp } from "./app-render";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
} from "./app-scroll";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  loadOverview as loadOverviewInternal,
  setTab as setTabInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
} from "./app-settings";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
} from "./app-tool-stream";
import { resolveInjectedAssistantIdentity } from "./assistant-identity";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity";
import { type SpeechRecognition } from "./speech";
import { loadSettings, type UiSettings } from "./storage";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types";
import { SkillMessage } from "./controllers/skills";

import {
  handleNewSession as handleNewSessionInternal,
  handleExportSession as handleExportSessionInternal,
  handleSessionsPatch as handleSessionsPatchInternal,
} from "./app-sessions";
import {
  handleToggleMic as handleToggleMicInternal,
  handleSpeak as handleSpeakInternal,
  handleFileUpload as handleFileUploadInternal,
  handleGlobalKeydown as handleGlobalKeydownInternal,
} from "./app-input";
import {
  handleToggleSettings as handleToggleSettingsInternal,
  handleOpenSidebar as handleOpenSidebarInternal,
  handleCloseSidebar as handleCloseSidebarInternal,
  handleSplitRatioChange as handleSplitRatioChangeInternal,
  handleGatewayUrlConfirm as handleGatewayUrlConfirmInternal,
  handleGatewayUrlCancel as handleGatewayUrlCancelInternal,
  handleExecApprovalDecision as handleExecApprovalDecisionInternal,
  handleChatSelectQueueItem as handleChatSelectQueueItemInternal,
  handleChatDropQueueItem as handleChatDropQueueItemInternal,
  handleChatClearQueue as handleChatClearQueueInternal,
  handleLogsFilterChange as handleLogsFilterChangeInternal,
  handleLogsLevelFilterToggle as handleLogsLevelFilterToggleInternal,
  handleLogsAutoFollowToggle as handleLogsAutoFollowToggleInternal,
  handleCallDebugMethod as handleCallDebugMethodInternal,
} from "./app-ui";
import {
  handleSkillsViewChange as handleSkillsViewChangeInternal,
} from "./app-skills-handlers";
import {
  loadActivities as loadActivitiesInternal,
  executeAction as executeActionInternal,
} from "./controllers/activities";

declare global {
  interface Window {
    __OPENCLAW_CONTROL_UI_BASE_PATH__?: string;
  }
}

const injectedAssistantIdentity = resolveInjectedAssistantIdentity();

function resolveOnboardingMode(): boolean {
  if (!window.location.search) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("openclaw-app")
export class OpenClawApp extends LitElement {
  @state() settings: UiSettings = loadSettings();
  @state() password = "";
  @state() tab: Tab = "chat";
  @state() onboarding = resolveOnboardingMode();
  @state() connected = false;
  @state() theme: ThemeMode = this.settings.theme ?? "system";
  @state() themeResolved: ResolvedTheme = "dark";
  @state() hello: GatewayHelloOk | null = null;
  @state() lastError: string | null = null;
  @state() eventLog: EventLogEntry[] = [];
  eventLogBuffer: EventLogEntry[] = [];
  private toolStreamSyncTimer: number | null = null;
  sidebarCloseTimer: number | null = null;

  @state() assistantName = injectedAssistantIdentity.name;
  @state() assistantAvatar = injectedAssistantIdentity.avatar;
  @state() assistantAgentId = injectedAssistantIdentity.agentId ?? null;

  @state() sessionKey = this.settings.sessionKey;
  @state() chatLoading = false;
  @state() chatSending = false;
  @state() chatMessage = "";
  @state() chatMessages: unknown[] = [];
  @state() chatToolMessages: unknown[] = [];
  @state() chatStream: string | null = null;
  @state() chatStreamStartedAt: number | null = null;
  @state() chatRunId: string | null = null;
  @state() compactionStatus: import("./app-tool-stream").CompactionStatus | null = null;
  @state() chatAvatarUrl: string | null = null;
  @state() chatThinkingLevel: string | null = null;
  @state() thinkingState: import("./components/thinking-panel").ThinkingState | null = null;
  @state() chatQueue: ChatQueueItem[] = [];
  @state() chatAttachments: ChatAttachment[] = [];
  @state() chatActionMessages: ActionMessage[] = [];
  @state() mobileSessionsOpen = false;
  @state() sessionSearchQuery = "";
  // Sidebar state for tool output viewing
  @state() sidebarOpen = false;
  @state() sidebarContent: string | null = null;
  @state() sidebarError: string | null = null;
  @state() splitRatio = this.settings.splitRatio;
  @state() isListening = false;
  @state() settingsOpen = false;

  @state() nodesLoading = false;
  @state() nodes: Array<Record<string, unknown>> = [];
  @state() devicesLoading = false;
  @state() devicesError: string | null = null;
  @state() devicesList: DevicePairingList | null = null;
  @state() execApprovalsLoading = false;
  @state() execApprovalsSaving = false;
  @state() execApprovalsDirty = false;
  @state() execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  @state() execApprovalsForm: ExecApprovalsFile | null = null;
  @state() execApprovalsSelectedAgent: string | null = null;
  @state() execApprovalsTarget: "gateway" | "node" = "gateway";
  @state() execApprovalsTargetNodeId: string | null = null;
  @state() execApprovalQueue: ExecApprovalRequest[] = [];
  @state() execApprovalBusy = false;
  @state() execApprovalError: string | null = null;
  @state() pendingGatewayUrl: string | null = null;

  @state() configLoading = false;
  @state() configRaw = "{\n}\n";
  @state() configRawOriginal = "";
  @state() configValid: boolean | null = null;
  @state() configIssues: unknown[] = [];
  @state() configSaving = false;
  @state() configApplying = false;
  @state() updateRunning = false;
  @state() applySessionKey = this.settings.lastActiveSessionKey;
  @state() configSnapshot: ConfigSnapshot | null = null;
  @state() configSchema: unknown = null;
  @state() configSchemaVersion: string | null = null;
  @state() configSchemaLoading = false;
  @state() configUiHints: ConfigUiHints = {};
  @state() configForm: Record<string, unknown> | null = null;
  @state() configFormOriginal: Record<string, unknown> | null = null;
  @state() configFormDirty = false;
  @state() configFormMode: "form" | "raw" = "form";
  @state() configSearchQuery = "";
  @state() configActiveSection: string | null = null;
  @state() configActiveSubsection: string | null = null;

  @state() channelsLoading = false;
  @state() channelsSnapshot: ChannelsStatusSnapshot | null = null;
  @state() channelsError: string | null = null;
  @state() channelsLastSuccess: number | null = null;
  @state() whatsappLoginMessage: string | null = null;
  @state() whatsappLoginQrDataUrl: string | null = null;
  @state() whatsappLoginConnected: boolean | null = null;
  @state() whatsappBusy = false;
  @state() nostrProfileFormState: NostrProfileFormState | null = null;
  @state() nostrProfileAccountId: string | null = null;
  /** Currently expanded channel key (accordion-style single expansion) */
  @state() channelsExpandedChannel: string | null = null;
  /** Whether to show the debug health panel */
  @state() channelsShowHealthDebug = false;

  @state() presenceLoading = false;
  @state() presenceEntries: PresenceEntry[] = [];
  @state() presenceError: string | null = null;
  @state() presenceStatus: StatusSummary | null = null;

  @state() agentsLoading = false;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentsError: string | null = null;

  @state() sessionsLoading = false;
  @state() sessionsResult: SessionsListResult | null = null;
  @state() sessionsError: string | null = null;
  @state() sessionsFilterActive = "";
  @state() sessionsFilterLimit = "120";
  @state() sessionsIncludeGlobal = true;
  @state() sessionsIncludeUnknown = false;

  @state() activitiesLoading = false;
  @state() activitiesList: ActivitiesListResult | null = null;
  @state() activitiesError: string | null = null;
  @state() activitiesExpandedSummaries: Set<string> = new Set();

  @state() secretsLoading = false;
  @state() secretsKeys: string[] = [];
  @state() secretsError: string | null = null;
  @state() secretsForm: { key: string; value: string } | null = null;
  @state() secretsSaving = false;

  @state() cronLoading = false;
  @state() cronJobs: CronJob[] = [];
  @state() cronStatus: CronStatus | null = null;
  @state() cronError: string | null = null;
  @state() cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  @state() cronRunsJobId: string | null = null;
  @state() cronRuns: CronRunLogEntry[] = [];
  @state() cronBusy = false;

  @state() skillsLoading = false;
  @state() skillsReport: SkillStatusReport | null = null;
  @state() skillsError: string | null = null;
  @state() skillsFilter = "";
  @state() skillsView: "installed" | "registry" = "installed";
  @state() registryLoading = false;
  @state() registryError: string | null = null;
  @state() registryList: import("./controllers/skills").RegistrySkill[] = [];
  @state() skillEdits: Record<string, string> = {};
  @state() skillsBusyKey: string | null = null;
  @state() skillMessages: Record<string, SkillMessage> = {};

  @state() debugLoading = false;
  @state() debugStatus: StatusSummary | null = null;
  @state() debugHealth: HealthSnapshot | null = null;
  @state() debugModels: unknown[] = [];
  @state() debugHeartbeat: unknown = null;
  @state() debugCallMethod = "";
  @state() debugCallParams = "{}";
  @state() debugCallResult: string | null = null;
  @state() debugCallError: string | null = null;

  @state() logsLoading = false;
  @state() logsError: string | null = null;
  @state() logsFile: string | null = null;
  @state() logsEntries: LogEntry[] = [];
  @state() logsFilterText = "";
  @state() logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  @state() logsAutoFollow = true;
  @state() logsTruncated = false;
  @state() logsCursor: number | null = null;
  @state() logsLastFetchAt: number | null = null;
  @state() logsLimit = 500;
  @state() logsMaxBytes = 250_000;
  @state() logsAtBottom = true;
  @state() chatUserNearBottom = true;

  client: GatewayBrowserClient | null = null;
  chatScrollFrame: number | null = null;
  chatScrollTimeout: number | null = null;
  chatHasAutoScrolled = false;
  nodesPollInterval: number | null = null;
  logsPollInterval: number | null = null;
  debugPollInterval: number | null = null;
  logsScrollFrame: number | null = null;
  toolStreamById = new Map<string, ToolStreamEntry>();
  toolStreamOrder: string[] = [];
  refreshSessionsAfterChat = new Set<string>();
  basePath = "";
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  themeMedia: MediaQueryList | null = null;
  themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private topbarObserver: ResizeObserver | null = null;
  recognition: SpeechRecognition | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
    window.addEventListener("keydown", this.handleGlobalKeydown);
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.handleGlobalKeydown);
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    if (this.recognition) {
      this.recognition.abort();
    }
    super.disconnectedCallback();
  }

  private handleGlobalKeydown = (e: KeyboardEvent) => {
    handleGlobalKeydownInternal(this, e);
  };

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  handleToggleMic() {
    handleToggleMicInternal(this);
  }

  handleToggleSettings() {
    handleToggleSettingsInternal(this);
  }

  handleSkillsViewChange(view: "installed" | "registry") {
    handleSkillsViewChangeInternal(this, view);
  }

  async handleSessionsPatch(key: string, patch: any) {
    await handleSessionsPatchInternal(this, key, patch);
  }

  handleSpeak(text: string) {
    handleSpeakInternal(text);
  }

  async handleFileUpload(file: File) {
    handleFileUploadInternal(this, file);
  }

  async handleExportSession(key: string) {
    await handleExportSessionInternal(this, key);
  }

  async handleNewSession() {
    await handleNewSessionInternal(this);
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
  }

  setTab(next: Tab) {
    setTabInternal(this as unknown as Parameters<typeof setTabInternal>[0], next);
  }

  setTheme(next: ThemeMode, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadOverview() {
    await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      messageOverride,
      opts,
    );
  }

  async handleDeleteMessage(messageId: string) {
    await handleDeleteMessageInternal(
      this as unknown as Parameters<typeof handleDeleteMessageInternal>[0],
      messageId,
    );
  }

  async handleDeleteFromMessage(messageId: string) {
    await handleDeleteFromMessageInternal(
      this as unknown as Parameters<typeof handleDeleteFromMessageInternal>[0],
      messageId,
    );
  }

  async handleRerunFromMessage(messageId: string) {
    await handleRerunFromMessageInternal(
      this as unknown as Parameters<typeof handleRerunFromMessageInternal>[0],
      messageId,
    );
  }

  async handleEditMessage(messageId: string, currentContent: string) {
    await handleEditMessageInternal(
      this as unknown as Parameters<typeof handleEditMessageInternal>[0],
      messageId,
      currentContent,
    );
  }

  handleCopyMessage(content: string) {
    navigator.clipboard.writeText(content).catch((err) => {
      console.error("Failed to copy message:", err);
    });
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  /** Toggle expanded state for a channel (accordion-style) */
  handleChannelToggle(key: string) {
    this.channelsExpandedChannel = this.channelsExpandedChannel === key ? null : key;
  }

  /** Toggle health debug panel */
  handleHealthDebugToggle() {
    this.channelsShowHealthDebug = !this.channelsShowHealthDebug;
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    await handleExecApprovalDecisionInternal(this, decision);
  }

  handleGatewayUrlConfirm() {
    handleGatewayUrlConfirmInternal(this);
  }

  handleGatewayUrlCancel() {
    handleGatewayUrlCancelInternal(this);
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    handleOpenSidebarInternal(this, content);
  }

  handleCloseSidebar() {
    handleCloseSidebarInternal(this);
  }

  handleSplitRatioChange(ratio: number) {
    handleSplitRatioChangeInternal(this, ratio);
  }

  handleChatSelectQueueItem(id: string) {
    handleChatSelectQueueItemInternal(this, id);
  }

  handleChatDropQueueItem(id: string) {
    handleChatDropQueueItemInternal(this, id);
  }

  handleChatClearQueue() {
    handleChatClearQueueInternal(this);
  }

  handleLogsFilterChange(next: string) {
    handleLogsFilterChangeInternal(this, next);
  }

  handleLogsLevelFilterToggle(level: LogLevel) {
    handleLogsLevelFilterToggleInternal(this, level);
  }

  handleLogsAutoFollowToggle(next: boolean) {
    handleLogsAutoFollowToggleInternal(this, next);
  }

  async handleCallDebugMethod(method: string, params: string) {
    await handleCallDebugMethodInternal(this, method, params);
  }

  async loadActivities() {
    await loadActivitiesInternal(this);
  }

  async handleActivityAction(sessionKey: string, actionId: string, parameters?: Record<string, unknown>) {
    await executeActionInternal(this, sessionKey, actionId, parameters);
  }

  /** Toggle expanded state for activity summary */
  handleToggleActivitySummary(sessionKey: string) {
    const newSet = new Set(this.activitiesExpandedSummaries);
    if (newSet.has(sessionKey)) {
      newSet.delete(sessionKey);
    } else {
      newSet.add(sessionKey);
    }
    this.activitiesExpandedSummaries = newSet;
  }

  /**
   * Adds an action message to the current chat session.
   */
  addActionMessage(action: ActionMessage) {
    this.chatActionMessages = [...this.chatActionMessages, action];
  }

  /**
   * Clears action messages for the current session.
   */
  clearActionMessages() {
    this.chatActionMessages = [];
  }

  /**
   * Handles renaming a session via in-place editing.
   */
  async handleRenameSession(key: string, newName: string) {
    await handleSessionsPatchInternal(this, key, { label: newName });
    // Add an action message about the rename
    this.addActionMessage({
      type: "session-renamed",
      title: "Session renamed",
      description: `Session renamed to "${newName}"`,
      timestamp: Date.now(),
    });
  }

  render() {
    return renderApp(this as any);
  }
}
