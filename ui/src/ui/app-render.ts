import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";
import { refreshChatAvatar } from "./app-chat";
import {
  renderChatControls,
  renderTab,
  renderExpandableTab,
  renderThemeToggle,
} from "./app-render.helpers";
import "./components/command-palette/command-palette";
import {
  handleSkillGroupToggle,
  handleSkillExpandToggle,
  handleSkillsViewChange,
} from "./app-skills-handlers";
import { loadActivities } from "./controllers/activities";
import { loadChannels } from "./controllers/channels";
import { loadChatHistory } from "./controllers/chat";
import {
  applyConfig,
  loadConfig,
  runUpdate,
  saveConfig,
  updateConfigFormValue,
  removeConfigFormValue,
} from "./controllers/config";
import {
  loadCronRuns,
  toggleCronJob,
  runCronJob,
  removeCronJob,
  addCronJob,
} from "./controllers/cron";
import { loadDebug, callDebugMethod } from "./controllers/debug";
import {
  approveDevicePairing,
  loadDevices,
  rejectDevicePairing,
  revokeDeviceToken,
  rotateDeviceToken,
} from "./controllers/devices";
import {
  loadExecApprovals,
  removeExecApprovalsFormValue,
  saveExecApprovals,
  updateExecApprovalsFormValue,
} from "./controllers/exec-approvals";
import { loadLogs } from "./controllers/logs";
import { loadNodes } from "./controllers/nodes";
import { loadPresence } from "./controllers/presence";
import {
  loadSecrets,
  saveSecret,
  deleteSecret,
  openSecretForm,
  closeSecretForm,
  updateSecretForm,
} from "./controllers/secrets";
import { deleteSession, loadSessions, patchSession } from "./controllers/sessions";
import {
  closeEditor,
  closeNewFileDialog,
  closeRenameDialog,
  createDirectory,
  createFile,
  deleteFile,
  loadFiles,
  openFile,
  openNewFileDialog,
  openRenameDialog,
  saveFile,
  submitNewFileDialog,
  submitRenameDialog,
  toggleDirectory,
  updateEditorContent,
  updateNewFileDialogName,
  updateRenameDialogName,
} from "./controllers/files";
import {
  installSkill,
  loadSkills,
  saveSkillApiKey,
  updateSkillEdit,
  updateSkillEnabled,
} from "./controllers/skills";
import { icons } from "./icons";
import { TAB_GROUPS, subtitleForTab, titleForTab, isExpandableTab } from "./navigation";
import { renderActivities } from "./views/activities";
import { renderChannels } from "./views/channels";
import { renderChat } from "./views/chat";
import { renderChatSettings } from "./views/chat-settings";
import { renderConfig } from "./views/config";
import { renderCron } from "./views/cron";
import { renderDebug } from "./views/debug";
import { renderExecApprovalPrompt } from "./views/exec-approval";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation";
import { renderInstances } from "./views/instances";
import { renderLogs } from "./views/logs";
import { renderNodes } from "./views/nodes";
import { renderOverview } from "./views/overview";
import { renderSecrets } from "./views/secrets";
import { renderFiles } from "./views/files";
import { renderAddAgentModal } from "./views/add-agent-modal";
import { renderSessionDeleteConfirm } from "./views/session-delete-confirm";
import { renderSessions } from "./views/sessions";
import { renderSkills } from "./views/skills";

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;

/**
 * Update slash autocomplete state based on current draft input.
 * Detects:
 * - "/" at the start of the message (slash commands)
 * - "@" anywhere in the message (agent mentions)
 */
function updateSlashAutocompleteState(state: AppViewState, draft: string) {
  // Check for slash command at start of message
  if (draft.startsWith("/")) {
    const query = draft.slice(1).split(/\s/)[0]; // Get text after / until whitespace
    if (draft.indexOf(" ") === -1 || draft.indexOf(" ") > draft.indexOf("/") + query.length) {
      state.slashAutocompleteOpen = true;
      state.slashAutocompleteMode = "slash";
      state.slashAutocompleteQuery = query;
      return;
    }
  }

  // Check for @ mention (find the last @ that's being typed)
  const lastAtIndex = draft.lastIndexOf("@");
  if (lastAtIndex >= 0) {
    // Check if we're in the middle of typing an @ mention
    const textAfterAt = draft.slice(lastAtIndex + 1);
    // Only show if no space after the @ (still typing the mention)
    if (!textAfterAt.includes(" ")) {
      state.slashAutocompleteOpen = true;
      state.slashAutocompleteMode = "mention";
      state.slashAutocompleteQuery = textAfterAt;
      return;
    }
  }

  // No autocomplete trigger found, close it
  state.slashAutocompleteOpen = false;
  state.slashAutocompleteQuery = "";
}

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

export function renderApp(state: AppViewState) {
  const presenceCount = state.presenceEntries.length;
  const sessionsCount = state.sessionsResult?.count ?? null;
  const cronNext = state.cronStatus?.nextWakeAtMs ?? null;
  const chatDisabledReason = state.connected ? null : "Disconnected from gateway.";
  const isChat = state.tab === "chat";
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const navWidth = state.settings.navWidth ?? 220;

  return html`
    <div
      class="shell ${isChat ? "shell--chat" : ""} ${chatFocus ? "shell--chat-focus" : ""} ${state.settings.navCollapsed ? "shell--nav-collapsed" : ""} ${state.onboarding ? "shell--onboarding" : ""}"
      style="--shell-nav-width: ${navWidth}px"
    >
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="nav-collapse-toggle"
            @click=${() =>
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              })}
            title="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
            aria-label="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
          >
            <span class="nav-collapse-toggle__icon">${icons.menu}</span>
          </button>
          <div class="brand">
            <div class="brand-logo">
              ${icons.openclaw}
            </div>
            <div class="brand-text">
              <div class="brand-title">OPENCLAW</div>
              <div class="brand-sub">Gateway Dashboard</div>
            </div>
          </div>
        </div>
        <div class="topbar-status">
          <div class="pill">
            <span class="statusDot ${state.connected ? "ok" : ""}"></span>
            <span>Health</span>
            <span class="mono">${state.connected ? "OK" : "Offline"}</span>
          </div>
          ${renderThemeToggle(state)}
        </div>
      </header>
      <aside class="nav ${state.settings.navCollapsed ? "nav--collapsed" : ""}">
        ${TAB_GROUPS.map((group) => {
          const isGroupCollapsed = state.settings.navGroupsCollapsed[group.label] ?? false;
          const hasActiveTab = group.tabs.some((tab) => tab === state.tab);
          return html`
            <div class="nav-group ${isGroupCollapsed && !hasActiveTab ? "nav-group--collapsed" : ""}">
              <button
                class="nav-label"
                @click=${() => {
                  const next = { ...state.settings.navGroupsCollapsed };
                  next[group.label] = !isGroupCollapsed;
                  state.applySettings({
                    ...state.settings,
                    navGroupsCollapsed: next,
                  });
                }}
                aria-expanded=${!isGroupCollapsed}
              >
                <span class="nav-label__text">${group.label}</span>
                <span class="nav-label__chevron">${isGroupCollapsed ? "+" : "−"}</span>
              </button>
              <div class="nav-group__items">
                ${group.tabs.map((tab) =>
                  isExpandableTab(tab) ? renderExpandableTab(state, tab) : renderTab(state, tab),
                )}
              </div>
            </div>
          `;
        })}
        <div class="nav-group nav-group--links">
          <div class="nav-label nav-label--static">
            <span class="nav-label__text">Resources</span>
          </div>
          <div class="nav-group__items">
            <a
              class="nav-item nav-item--external"
              href="https://docs.openclaw.ai"
              target="_blank"
              rel="noreferrer"
              title="Docs (opens in new tab)"
            >
              <span class="nav-item__icon" aria-hidden="true">${icons.book}</span>
              <span class="nav-item__text">Docs</span>
            </a>
          </div>
        </div>
      </aside>
      <div
        class="shell-resizer"
        @mousedown=${(e: MouseEvent) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = navWidth;
          const shell = (e.target as HTMLElement).closest(".shell");
          shell?.classList.add("shell--resizing");

          const onMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.clientX - startX;
            state.handleNavResize(startWidth + delta);
          };

          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            shell?.classList.remove("shell--resizing");
          };

          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      ></div>
      <main class="content ${isChat ? "content--chat" : ""}">
        <section class="content-header">
          <div>
            <div class="page-title">${titleForTab(state.tab)}</div>
            <div class="page-sub">${subtitleForTab(state.tab)}</div>
          </div>
          <div class="page-meta">
            ${state.lastError ? html`<div class="pill danger">${state.lastError}</div>` : nothing}
            ${isChat ? renderChatControls(state) : nothing}
          </div>
        </section>

        ${
          state.tab === "overview"
            ? renderOverview({
                connected: state.connected,
                hello: state.hello,
                settings: state.settings,
                password: state.password,
                lastError: state.lastError,
                presenceCount,
                sessionsCount,
                cronEnabled: state.cronStatus?.enabled ?? null,
                cronNext,
                lastChannelsRefresh: state.channelsLastSuccess,
                onSettingsChange: (next) => state.applySettings(next),
                onPasswordChange: (next) => (state.password = next),
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.resetToolStream();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                },
                onConnect: () => state.connect(),
                onRefresh: () => state.loadOverview(),
              })
            : nothing
        }

        ${
          state.tab === "channels"
            ? renderChannels({
                connected: state.connected,
                loading: state.channelsLoading,
                snapshot: state.channelsSnapshot,
                lastError: state.channelsError,
                lastSuccessAt: state.channelsLastSuccess,
                whatsappMessage: state.whatsappLoginMessage,
                whatsappQrDataUrl: state.whatsappLoginQrDataUrl,
                whatsappConnected: state.whatsappLoginConnected,
                whatsappBusy: state.whatsappBusy,
                configSchema: state.configSchema,
                configSchemaLoading: state.configSchemaLoading,
                configForm: state.configForm,
                configUiHints: state.configUiHints,
                configSaving: state.configSaving,
                configFormDirty: state.configFormDirty,
                nostrProfileFormState: state.nostrProfileFormState,
                nostrProfileAccountId: state.nostrProfileAccountId,
                expandedChannel: state.channelsExpandedChannel,
                showHealthDebug: state.channelsShowHealthDebug,
                onRefresh: (probe) => loadChannels(state, probe),
                onWhatsAppStart: (force) => state.handleWhatsAppStart(force),
                onWhatsAppWait: () => state.handleWhatsAppWait(),
                onWhatsAppLogout: () => state.handleWhatsAppLogout(),
                onConfigPatch: (path, value) => updateConfigFormValue(state, path, value),
                onConfigSave: () => state.handleChannelConfigSave(),
                onConfigReload: () => state.handleChannelConfigReload(),
                onNostrProfileEdit: (accountId, profile) =>
                  state.handleNostrProfileEdit(accountId, profile),
                onNostrProfileCancel: () => state.handleNostrProfileCancel(),
                onNostrProfileFieldChange: (field, value) =>
                  state.handleNostrProfileFieldChange(field, value),
                onNostrProfileSave: () => state.handleNostrProfileSave(),
                onNostrProfileImport: () => state.handleNostrProfileImport(),
                onNostrProfileToggleAdvanced: () => state.handleNostrProfileToggleAdvanced(),
                onChannelToggle: (key) => state.handleChannelToggle(key),
                onHealthDebugToggle: () => state.handleHealthDebugToggle(),
              })
            : nothing
        }

        ${
          state.tab === "instances"
            ? renderInstances({
                loading: state.presenceLoading,
                entries: state.presenceEntries,
                lastError: state.presenceError,
                // oxlint-disable-next-line typescript/no-explicit-any -- legacy type cast
                statusMessage: state.presenceStatus as any,
                // oxlint-disable-next-line typescript/no-explicit-any -- legacy type cast
                onRefresh: () => loadPresence(state as any),
              })
            : nothing
        }

        ${
          state.tab === "sessions"
            ? renderSessions({
                loading: state.sessionsLoading,
                result: state.sessionsResult,
                error: state.sessionsError,
                activeMinutes: state.sessionsFilterActive,
                limit: state.sessionsFilterLimit,
                includeGlobal: state.sessionsIncludeGlobal,
                includeUnknown: state.sessionsIncludeUnknown,
                basePath: state.basePath,
                onFiltersChange: (next) => {
                  state.sessionsFilterActive = next.activeMinutes;
                  state.sessionsFilterLimit = next.limit;
                  state.sessionsIncludeGlobal = next.includeGlobal;
                  state.sessionsIncludeUnknown = next.includeUnknown;
                },
                onRefresh: () => loadSessions(state),
                onPatch: (key, patch) => patchSession(state, key, patch),
                onDelete: (key) => deleteSession(state, key),
              })
            : nothing
        }

        ${
          state.tab === "activities"
            ? renderActivities({
                loading: state.activitiesLoading,
                activities: state.activitiesList?.activities ?? [],
                error: state.activitiesError,
                basePath: state.basePath,
                onRefresh: () => loadActivities(state),
                onAction: (sessionKey, actionId, params) =>
                  state.handleActivityAction(sessionKey, actionId, params),
                onOpenChat: (sessionKey) => {
                  state.sessionKey = sessionKey;
                  // Clear messages BEFORE switching to chat tab to ensure the new session's
                  // messages are loaded correctly (prevents stale message count check)
                  state.chatMessages = [];
                  state.chatLoading = true;
                  state.setTab("chat");
                },
                expandedSummaries: state.activitiesExpandedSummaries,
                onToggleSummary: (sessionKey) => state.handleToggleActivitySummary(sessionKey),
                // Model selection - pass available models from debug state
                availableModels: Array.isArray(state.debugModels)
                  ? (state.debugModels as Array<{ id: string; provider: string }>)
                  : [],
                onModelChange: (sessionKey, model) =>
                  state.handleActivityModelChange(sessionKey, model),
                // Pause/Resume
                onPause: (sessionKey) => state.handleActivityPause(sessionKey),
                onResume: (sessionKey) => state.handleActivityResume(sessionKey),
                // Delete
                onDelete: (sessionKey) => state.handleActivityDelete(sessionKey),
                // Send message to chat
                onSendMessage: (sessionKey, message) =>
                  state.handleActivitySendMessage(sessionKey, message),
              })
            : nothing
        }

        ${
          state.tab === "cron"
            ? renderCron({
                loading: state.cronLoading,
                status: state.cronStatus,
                jobs: state.cronJobs,
                error: state.cronError,
                busy: state.cronBusy,
                form: state.cronForm,
                channels: state.channelsSnapshot?.channelMeta?.length
                  ? state.channelsSnapshot.channelMeta.map((entry) => entry.id)
                  : (state.channelsSnapshot?.channelOrder ?? []),
                channelLabels: state.channelsSnapshot?.channelLabels ?? {},
                channelMeta: state.channelsSnapshot?.channelMeta ?? [],
                runsJobId: state.cronRunsJobId,
                runs: state.cronRuns,
                filter: state.cronFilter,
                view: state.cronView,
                expandedJob: state.cronExpandedJob,
                onFilterChange: (next) => (state.cronFilter = next),
                onFormChange: (patch) => (state.cronForm = { ...state.cronForm, ...patch }),
                onRefresh: () => state.loadCron(),
                onAdd: () =>
                  addCronJob({
                    ...state,
                    addActionMessage: (action) => state.addActionMessage(action),
                  }),
                onToggle: (job, enabled) => toggleCronJob(state, job, enabled),
                onRun: (job) => runCronJob(state, job),
                onRemove: (job) => removeCronJob(state, job),
                onLoadRuns: (jobId) => {
                  loadCronRuns(state, jobId);
                  state.cronView = "runs";
                },
                onViewChange: (view) => (state.cronView = view),
                onJobExpand: (jobId) => (state.cronExpandedJob = jobId),
              })
            : nothing
        }

        ${
          state.tab === "secrets"
            ? renderSecrets({
                loading: state.secretsLoading,
                keys: state.secretsKeys,
                error: state.secretsError,
                form: state.secretsForm,
                saving: state.secretsSaving,
                onRefresh: () => loadSecrets(state),
                onAdd: () => openSecretForm(state),
                onEdit: (key) => openSecretForm(state, key),
                onDelete: (key) => deleteSecret(state, key),
                onFormClose: () => closeSecretForm(state),
                onFormUpdate: (patch) => updateSecretForm(state, patch),
                onFormSave: () => {
                  if (state.secretsForm) {
                    void saveSecret(state, state.secretsForm.key, state.secretsForm.value);
                  }
                },
              })
            : nothing
        }

        ${
          state.tab === "files"
            ? renderFiles({
                loading: state.filesLoading,
                tree: state.filesTree ?? [],
                error: state.filesError,
                selectedPath: state.filesSelectedPath,
                editorPath: state.filesEditorPath,
                editorContent: state.filesEditorContent,
                editorLoading: state.filesEditorLoading,
                editorSaving: state.filesEditorSaving,
                editorDirty: state.filesEditorDirty,
                busy: state.filesBusy,
                newDialog: state.filesNewDialog,
                renameDialog: state.filesRenameDialog,
                onRefresh: () => loadFiles(state),
                onToggleDirectory: (path) => toggleDirectory(state, path),
                onSelectFile: (path) => {
                  state.filesSelectedPath = path;
                },
                onOpenFile: (path) => openFile(state, path),
                onCloseEditor: () => closeEditor(state),
                onEditorChange: (content) => updateEditorContent(state, content),
                onSaveFile: () => saveFile(state),
                onDeleteFile: (path) => deleteFile(state, path),
                onNewFile: (parentPath) => openNewFileDialog(state, parentPath, "file"),
                onNewFolder: (parentPath) => openNewFileDialog(state, parentPath, "directory"),
                onRename: (path) => openRenameDialog(state, path),
                onNewDialogClose: () => closeNewFileDialog(state),
                onNewDialogNameChange: (name) => updateNewFileDialogName(state, name),
                onNewDialogSubmit: () => submitNewFileDialog(state),
                onRenameDialogClose: () => closeRenameDialog(state),
                onRenameDialogNameChange: (name) => updateRenameDialogName(state, name),
                onRenameDialogSubmit: () => submitRenameDialog(state),
              })
            : nothing
        }

        ${
          state.tab === "skills"
            ? renderSkills({
                loading: state.skillsLoading,
                report: state.skillsReport,
                error: state.skillsError,
                filter: state.skillsFilter,
                edits: state.skillEdits,
                messages: state.skillMessages,
                busyKey: state.skillsBusyKey,
                view: state.skillsView,
                registryLoading: state.registryLoading,
                registryError: state.registryError,
                registryList: state.registryList,
                expandedGroups: state.skillsExpandedGroups,
                expandedSkill: state.skillsExpandedSkill,
                // oxlint-disable-next-line typescript/no-explicit-any -- legacy type cast
                onFilterChange: (next: any) => (state.skillsFilter = next),
                // oxlint-disable-next-line typescript/no-explicit-any -- legacy type cast
                onRefresh: () => loadSkills(state as any, { clearMessages: true }),
                // oxlint-disable-next-line typescript/no-explicit-any -- legacy type cast
                onToggle: (key: any, enabled: any) =>
                  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- legacy type cast
                  updateSkillEnabled(state as any, key, enabled),
                // oxlint-disable-next-line typescript/no-explicit-any -- legacy type cast
                onEdit: (key: any, value: any) => updateSkillEdit(state as any, key, value),
                // oxlint-disable-next-line typescript/no-explicit-any -- legacy type cast
                onSaveKey: (key: any) => saveSkillApiKey(state as any, key),
                // oxlint-disable-next-line typescript/no-explicit-any -- legacy type cast
                onInstall: (skillKey: any, name: any, installId: any) =>
                  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- legacy type cast
                  installSkill(state as any, skillKey, name, installId),
                onViewChange: (view: "installed" | "registry") =>
                  handleSkillsViewChange(state, view),
                onGroupToggle: (group: string) => handleSkillGroupToggle(state, group),
                onSkillExpand: (skillKey: string | null) =>
                  handleSkillExpandToggle(state, skillKey),
                // oxlint-disable-next-line typescript/no-explicit-any -- legacy type cast
              } as any)
            : nothing
        }

        ${
          state.tab === "nodes"
            ? renderNodes({
                loading: state.nodesLoading,
                nodes: state.nodes,
                devicesLoading: state.devicesLoading,
                devicesError: state.devicesError,
                devicesList: state.devicesList,
                configForm:
                  state.configForm ??
                  (state.configSnapshot?.config as Record<string, unknown> | null),
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                configFormMode: state.configFormMode,
                execApprovalsLoading: state.execApprovalsLoading,
                execApprovalsSaving: state.execApprovalsSaving,
                execApprovalsDirty: state.execApprovalsDirty,
                execApprovalsSnapshot: state.execApprovalsSnapshot,
                execApprovalsForm: state.execApprovalsForm,
                execApprovalsSelectedAgent: state.execApprovalsSelectedAgent,
                execApprovalsTarget: state.execApprovalsTarget,
                execApprovalsTargetNodeId: state.execApprovalsTargetNodeId,
                onRefresh: () => loadNodes(state),
                onDevicesRefresh: () => loadDevices(state),
                onDeviceApprove: (requestId) => approveDevicePairing(state, requestId),
                onDeviceReject: (requestId) => rejectDevicePairing(state, requestId),
                onDeviceRotate: (deviceId, role, scopes) =>
                  rotateDeviceToken(state, { deviceId, role, scopes }),
                onDeviceRevoke: (deviceId, role) => revokeDeviceToken(state, { deviceId, role }),
                onLoadConfig: () => loadConfig(state),
                onLoadExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return loadExecApprovals(state, target);
                },
                onBindDefault: (nodeId) => {
                  if (nodeId) {
                    updateConfigFormValue(state, ["tools", "exec", "node"], nodeId);
                  } else {
                    removeConfigFormValue(state, ["tools", "exec", "node"]);
                  }
                },
                onBindAgent: (agentIndex, nodeId) => {
                  const basePath = ["agents", "list", agentIndex, "tools", "exec", "node"];
                  if (nodeId) {
                    updateConfigFormValue(state, basePath, nodeId);
                  } else {
                    removeConfigFormValue(state, basePath);
                  }
                },
                onSaveBindings: () => saveConfig(state),
                onExecApprovalsTargetChange: (kind, nodeId) => {
                  state.execApprovalsTarget = kind;
                  state.execApprovalsTargetNodeId = nodeId;
                  state.execApprovalsSnapshot = null;
                  state.execApprovalsForm = null;
                  state.execApprovalsDirty = false;
                  state.execApprovalsSelectedAgent = null;
                },
                onExecApprovalsSelectAgent: (agentId) => {
                  state.execApprovalsSelectedAgent = agentId;
                },
                onExecApprovalsPatch: (path, value) =>
                  updateExecApprovalsFormValue(state, path, value),
                onExecApprovalsRemove: (path) => removeExecApprovalsFormValue(state, path),
                onSaveExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return saveExecApprovals(state, target);
                },
              })
            : nothing
        }

        ${
          state.tab === "chat"
            ? renderChat({
                sessionKey: state.sessionKey,
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.chatAttachments = [];
                  state.chatStream = null;
                  state.chatStreamStartedAt = null;
                  state.chatRunId = null;
                  state.chatQueue = [];
                  // Clear messages and recommendations BEFORE loading history to ensure
                  // the new session's state is loaded correctly
                  state.chatMessages = [];
                  state.chatRecommendations = [];
                  state.chatLoading = true;
                  state.resetToolStream();
                  state.resetChatScroll();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                  void loadChatHistory(state);
                  void refreshChatAvatar(state);
                  // Note: recommendations are fetched after loadChatHistory completes (in the controller)
                },
                // Model/provider selection
                availableModels: Array.isArray(state.debugModels)
                  ? (state.debugModels as Array<{ id: string; provider: string }>)
                  : [],
                currentModel:
                  state.sessionsResult?.sessions?.find((s) => s.key === state.sessionKey)?.model ??
                  null,
                onModelChange: (modelId) => {
                  void state.handleSessionsPatch(state.sessionKey, { model: modelId });
                },
                thinkingLevel: state.chatThinkingLevel,
                showThinking,
                thinkingState: state.thinkingState,
                loading: state.chatLoading,
                sending: state.chatSending,
                compactionStatus: state.compactionStatus,
                assistantAvatarUrl: chatAvatarUrl,
                messages: state.chatMessages,
                toolMessages: state.chatToolMessages,
                stream: state.chatStream,
                streamStartedAt: state.chatStreamStartedAt,
                draft: state.chatMessage,
                queue: state.chatQueue,
                connected: state.connected,
                canSend: state.connected,
                disabledReason: chatDisabledReason,
                error: state.lastError,
                sessions: state.sessionsResult,
                focusMode: chatFocus,
                actionMessages: state.chatActionMessages,
                recommendations: state.chatRecommendations,
                onRefresh: () => {
                  state.resetToolStream();
                  // Recommendations are refreshed after loadChatHistory completes (in the controller)
                  return Promise.all([loadChatHistory(state), refreshChatAvatar(state)]);
                },
                onToggleFocusMode: () => {
                  if (state.onboarding) {
                    return;
                  }
                  state.applySettings({
                    ...state.settings,
                    chatFocusMode: !state.settings.chatFocusMode,
                  });
                },
                onChatScroll: (event) => state.handleChatScroll(event),
                onDraftChange: (next) => {
                  state.chatMessage = next;
                  // Detect slash commands and @ mentions for autocomplete
                  updateSlashAutocompleteState(state, next);
                },
                attachments: state.chatAttachments,
                onAttachmentsChange: (next) => (state.chatAttachments = next),
                onSend: () => state.handleSendChat(),
                canAbort: Boolean(state.chatRunId),
                onAbort: () => void state.handleAbortChat(),
                onQueueRemove: (id) => state.removeQueuedMessage(id),
                onNewSession: () => state.handleNewSession(),
                onDeleteSession: (key) => deleteSession(state, key),
                onExportSession: (key) => state.handleExportSession(key),
                onDeleteMessage: (id) => state.handleDeleteMessage(id),
                onDeleteFromMessage: (id) => state.handleDeleteFromMessage(id),
                onRerunFromMessage: (id) => state.handleRerunFromMessage(id),
                onEditMessage: (id, content) => state.handleEditMessage(id, content),
                onCopyMessage: (content) => state.handleCopyMessage(content),
                onRenameSession: (key, newName) => state.handleRenameSession(key, newName),
                userNearBottom: state.chatUserNearBottom,
                onScrollToBottom: () => {
                  state.resetChatScroll();
                  // Force scroll after render
                  setTimeout(() => state.resetChatScroll(), 0);
                },
                mobileSessionsOpen: state.mobileSessionsOpen,
                onToggleMobileSessions: () =>
                  (state.mobileSessionsOpen = !state.mobileSessionsOpen),
                sessionSearchQuery: state.sessionSearchQuery,
                onSessionSearchChange: (query) => (state.sessionSearchQuery = query),
                onToggleMic: () => state.handleToggleMic(),
                isListening: state.isListening,
                onSpeak: (text) => state.handleSpeak(text),
                onFileUpload: (file) => state.handleFileUpload(file),
                onSettings: () => state.handleToggleSettings(),
                // Sidebar props for tool output viewing
                sidebarOpen: state.sidebarOpen,
                sidebarContent: state.sidebarContent,
                sidebarError: state.sidebarError,
                splitRatio: state.splitRatio,
                onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
                onCloseSidebar: () => state.handleCloseSidebar(),
                onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
                assistantName: state.assistantName,
                assistantAvatar: state.assistantAvatar,
                // Slash autocomplete props
                slashAutocompleteOpen: state.slashAutocompleteOpen,
                slashAutocompleteMode: state.slashAutocompleteMode,
                slashAutocompleteQuery: state.slashAutocompleteQuery,
                slashAutocompleteAgents: [], // TODO: populate from group chat agents
                isGroupChat: false, // TODO: determine from session type
                // oxlint-disable-next-line typescript/no-explicit-any -- legacy type cast
                onSlashAutocompleteSelect: (suggestion: any) =>
                  state.handleSlashAutocompleteSelect(suggestion),
                onSlashAutocompleteClose: () => state.handleSlashAutocompleteClose(),
                // Context sidebar (right-hand panel) props
                contextSidebarOpen: state.contextSidebarOpen,
                onToggleContextSidebar: () => state.handleToggleContextSidebar(),
                visualizations: state.visualizations ?? [],
                selectedVisualization: state.selectedVisualization ?? null,
                onSelectVisualization: (viz) => state.handleSelectVisualization(viz),
                onOpenVisualization: (viz) => state.handleOpenVisualization(viz),
                cronJobs: state.cronJobs ?? [],
                onToggleCronJob: (job, enabled) => toggleCronJob(state, job, enabled),
                onRunCronJob: (job) => runCronJob(state, job),
              })
            : nothing
        }

        ${
          state.tab === "config"
            ? renderConfig({
                raw: state.configRaw,
                originalRaw: state.configRawOriginal,
                valid: state.configValid,
                issues: state.configIssues,
                loading: state.configLoading,
                saving: state.configSaving,
                applying: state.configApplying,
                updating: state.updateRunning,
                connected: state.connected,
                schema: state.configSchema,
                schemaLoading: state.configSchemaLoading,
                uiHints: state.configUiHints,
                formMode: state.configFormMode,
                formValue: state.configForm,
                originalValue: state.configFormOriginal,
                searchQuery: state.configSearchQuery,
                activeSection: state.configActiveSection,
                activeSubsection: state.configActiveSubsection,
                expandedPaths: state.configExpandedPaths,
                onRawChange: (next) => {
                  state.configRaw = next;
                },
                onFormModeChange: (mode) => (state.configFormMode = mode),
                onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
                onSearchChange: (query) => (state.configSearchQuery = query),
                onSectionChange: (section) => {
                  state.configActiveSection = section;
                  state.configActiveSubsection = null;
                },
                onSubsectionChange: (section) => (state.configActiveSubsection = section),
                onExpandToggle: (pathKey) => state.handleConfigExpandToggle(pathKey),
                onReload: () => loadConfig(state),
                onSave: () => saveConfig(state),
                onApply: () => applyConfig(state),
                onUpdate: () => runUpdate(state),
              })
            : nothing
        }

        ${
          state.tab === "debug"
            ? renderDebug({
                loading: state.debugLoading,
                status: state.debugStatus,
                health: state.debugHealth,
                models: state.debugModels,
                heartbeat: state.debugHeartbeat,
                eventLog: state.eventLog,
                callMethod: state.debugCallMethod,
                callParams: state.debugCallParams,
                callResult: state.debugCallResult,
                callError: state.debugCallError,
                onCallMethodChange: (next) => (state.debugCallMethod = next),
                onCallParamsChange: (next) => (state.debugCallParams = next),
                onRefresh: () => loadDebug(state),
                onCall: () => callDebugMethod(state),
              })
            : nothing
        }

        ${
          state.tab === "logs"
            ? renderLogs({
                loading: state.logsLoading,
                error: state.logsError,
                file: state.logsFile,
                entries: state.logsEntries,
                filterText: state.logsFilterText,
                levelFilters: state.logsLevelFilters,
                autoFollow: state.logsAutoFollow,
                truncated: state.logsTruncated,
                onFilterTextChange: (next) => (state.logsFilterText = next),
                onLevelToggle: (level, enabled) => {
                  state.logsLevelFilters = { ...state.logsLevelFilters, [level]: enabled };
                },
                onToggleAutoFollow: (next) => (state.logsAutoFollow = next),
                // oxlint-disable-next-line typescript/no-explicit-any -- legacy type cast
                onRefresh: () => loadLogs(state as any, { reset: true }),
                onExport: (lines, label) => state.exportLogs(lines, label),
                onScroll: (event) => state.handleLogsScroll(event),
              })
            : nothing
        }
      </main>
      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
      ${renderSessionDeleteConfirm(state)}
      ${renderAddAgentModal(state)}
      ${renderChatSettings(state)}
      <command-palette
        .open=${state.commandPaletteOpen}
        @close=${() => state.handleCloseCommandPalette()}
      ></command-palette>
    </div>
  `;
}
