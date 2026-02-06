import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { AppViewState } from "./app-view-state";
import type { ThemeMode } from "./theme";
import type { ThemeTransitionContext } from "./theme-transition";
import type { SessionsListResult } from "./types";
import { refreshChat } from "./app-chat";
import { syncUrlWithSessionKey } from "./app-settings";
import { loadSessions } from "./controllers/sessions";
import { loadChatHistory } from "./controllers/chat";
import { formatAgo } from "./format";
import { icons } from "./icons";
import {
  iconForTab,
  pathForTab,
  titleForTab,
  isExpandableTab,
  EXPANDABLE_TAB_CONFIG,
  type Tab,
  type ExpandableTab,
} from "./navigation";
import {
  GLOBAL_SESSION_KEY as GLOBAL_KEY,
  GLOBAL_SESSION_DISPLAY_NAME as GLOBAL_NAME,
} from "./types";

export function renderTab(state: AppViewState, tab: Tab) {
  const href = pathForTab(tab, state.basePath);
  return html`
    <a
      href=${href}
      class="nav-item ${state.tab === tab ? "active" : ""}"
      @click=${(event: MouseEvent) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        state.setTab(tab);
      }}
      title=${titleForTab(tab)}
    >
      <span class="nav-item__icon" aria-hidden="true">${icons[iconForTab(tab)]}</span>
      <span class="nav-item__text">${titleForTab(tab)}</span>
    </a>
  `;
}

export function renderChatControls(state: AppViewState) {
  const mainSessionKey = resolveMainSessionKey(state.hello, state.sessionsResult);
  const sessionOptions = resolveSessionOptions(
    state.sessionKey,
    state.sessionsResult,
    mainSessionKey,
  );
  const disableThinkingToggle = state.onboarding;
  const disableFocusToggle = state.onboarding;
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const focusActive = state.onboarding ? true : state.settings.chatFocusMode;
  // Refresh icon
  const refreshIcon = html`
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
      <path d="M21 3v5h-5"></path>
    </svg>
  `;
  const focusIcon = html`
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 7V4h3"></path>
      <path d="M20 7V4h-3"></path>
      <path d="M4 17v3h3"></path>
      <path d="M20 17v3h-3"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
  return html`
    <div class="chat-controls">
      <label class="field chat-controls__session">
        <select
          .value=${state.sessionKey}
          ?disabled=${!state.connected}
          @change=${(e: Event) => {
            const next = (e.target as HTMLSelectElement).value;
            state.sessionKey = next;
            state.chatMessage = "";
            state.chatStream = null;
            state.chatStreamStartedAt = null;
            state.chatRunId = null;
            // Clear messages BEFORE loading history to ensure the new session's
            // messages are loaded correctly (prevents stale message count check)
            state.chatMessages = [];
            state.chatLoading = true;
            state.resetToolStream();
            state.resetChatScroll();
            state.applySettings({
              ...state.settings,
              sessionKey: next,
              lastActiveSessionKey: next,
            });
            void state.loadAssistantIdentity();
            syncUrlWithSessionKey(
              state as unknown as Parameters<typeof syncUrlWithSessionKey>[0],
              next,
              true,
            );
            void loadChatHistory(state);
          }}
        >
          ${repeat(
            sessionOptions,
            (entry) => entry.key,
            (entry) =>
              html`<option value=${entry.key}>
                ${entry.displayName ?? entry.key}
              </option>`,
          )}
        </select>
      </label>
      <button
        class="btn btn--sm btn--icon"
        ?disabled=${state.chatLoading || !state.connected}
        @click=${() => {
          state.resetToolStream();
          void refreshChat(state as unknown as Parameters<typeof refreshChat>[0]);
        }}
        title="Refresh chat data"
      >
        ${refreshIcon}
      </button>
      <span class="chat-controls__separator">|</span>
      <button
        class="btn btn--sm btn--icon ${showThinking ? "active" : ""}"
        ?disabled=${disableThinkingToggle}
        @click=${() => {
          if (disableThinkingToggle) {
            return;
          }
          state.applySettings({
            ...state.settings,
            chatShowThinking: !state.settings.chatShowThinking,
          });
        }}
        aria-pressed=${showThinking}
        title=${
          disableThinkingToggle
            ? "Disabled during onboarding"
            : "Toggle assistant thinking/working output"
        }
      >
        ${icons.brain}
      </button>
      <button
        class="btn btn--sm btn--icon ${focusActive ? "active" : ""}"
        ?disabled=${disableFocusToggle}
        @click=${() => {
          if (disableFocusToggle) {
            return;
          }
          state.applySettings({
            ...state.settings,
            chatFocusMode: !state.settings.chatFocusMode,
          });
        }}
        aria-pressed=${focusActive}
        title=${
          disableFocusToggle
            ? "Disabled during onboarding"
            : "Toggle focus mode (hide sidebar + page header)"
        }
      >
        ${focusIcon}
      </button>
    </div>
  `;
}

type SessionDefaultsSnapshot = {
  mainSessionKey?: string;
  mainKey?: string;
};

function resolveMainSessionKey(
  hello: AppViewState["hello"],
  sessions: SessionsListResult | null,
): string | null {
  const snapshot = hello?.snapshot as { sessionDefaults?: SessionDefaultsSnapshot } | undefined;
  const mainSessionKey = snapshot?.sessionDefaults?.mainSessionKey?.trim();
  if (mainSessionKey) {
    return mainSessionKey;
  }
  const mainKey = snapshot?.sessionDefaults?.mainKey?.trim();
  if (mainKey) {
    return mainKey;
  }
  if (sessions?.sessions?.some((row) => row.key === "main")) {
    return "main";
  }
  return null;
}

function resolveSessionDisplayName(key: string, row?: SessionsListResult["sessions"][number]) {
  const label = row?.label?.trim();
  if (label) {
    return `${label} (${key})`;
  }
  const displayName = row?.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  return key;
}

function resolveSessionOptions(
  sessionKey: string,
  sessions: SessionsListResult | null,
  mainSessionKey?: string | null,
) {
  const seen = new Set<string>();
  const options: Array<{ key: string; displayName?: string }> = [];

  const resolvedMain = mainSessionKey && sessions?.sessions?.find((s) => s.key === mainSessionKey);
  const resolvedCurrent = sessions?.sessions?.find((s) => s.key === sessionKey);

  // Add main session key first
  if (mainSessionKey) {
    seen.add(mainSessionKey);
    options.push({
      key: mainSessionKey,
      displayName: resolveSessionDisplayName(mainSessionKey, resolvedMain || undefined),
    });
  }

  // Add current session key next
  if (!seen.has(sessionKey)) {
    seen.add(sessionKey);
    options.push({
      key: sessionKey,
      displayName: resolveSessionDisplayName(sessionKey, resolvedCurrent),
    });
  }

  // Add sessions from the result
  if (sessions?.sessions) {
    for (const s of sessions.sessions) {
      if (!seen.has(s.key)) {
        seen.add(s.key);
        options.push({
          key: s.key,
          displayName: resolveSessionDisplayName(s.key, s),
        });
      }
    }
  }

  return options;
}

const THEME_ORDER: ThemeMode[] = ["system", "light", "dark"];

export function renderThemeToggle(state: AppViewState) {
  const index = Math.max(0, THEME_ORDER.indexOf(state.theme));
  const applyTheme = (next: ThemeMode) => (event: MouseEvent) => {
    const element = event.currentTarget as HTMLElement;
    const context: ThemeTransitionContext = { element };
    if (event.clientX || event.clientY) {
      context.pointerClientX = event.clientX;
      context.pointerClientY = event.clientY;
    }
    state.setTheme(next, context);
  };

  return html`
    <div class="theme-toggle" style="--theme-index: ${index};">
      <div class="theme-toggle__track" role="group" aria-label="Theme">
        <span class="theme-toggle__indicator"></span>
        <button
          class="theme-toggle__button ${state.theme === "system" ? "active" : ""}"
          @click=${applyTheme("system")}
          aria-pressed=${state.theme === "system"}
          aria-label="System theme"
          title="System"
        >
          ${renderMonitorIcon()}
        </button>
        <button
          class="theme-toggle__button ${state.theme === "light" ? "active" : ""}"
          @click=${applyTheme("light")}
          aria-pressed=${state.theme === "light"}
          aria-label="Light theme"
          title="Light"
        >
          ${renderSunIcon()}
        </button>
        <button
          class="theme-toggle__button ${state.theme === "dark" ? "active" : ""}"
          @click=${applyTheme("dark")}
          aria-pressed=${state.theme === "dark"}
          aria-label="Dark theme"
          title="Dark"
        >
          ${renderMoonIcon()}
        </button>
      </div>
    </div>
  `;
}

function renderSunIcon() {
  return html`
    <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2"></path>
      <path d="M12 20v2"></path>
      <path d="m4.93 4.93 1.41 1.41"></path>
      <path d="m17.66 17.66 1.41 1.41"></path>
      <path d="M2 12h2"></path>
      <path d="M20 12h2"></path>
      <path d="m6.34 17.66-1.41 1.41"></path>
      <path d="m19.07 4.93-1.41 1.41"></path>
    </svg>
  `;
}

function renderMoonIcon() {
  return html`
    <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
      ></path>
    </svg>
  `;
}

function renderMonitorIcon() {
  return html`
    <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="20" height="14" x="2" y="3" rx="2"></rect>
      <line x1="8" x2="16" y1="21" y2="21"></line>
      <line x1="12" x2="12" y1="17" y2="21"></line>
    </svg>
  `;
}

/**
 * Renders an expandable nav item for tabs that have sub-items (e.g., chat sessions).
 */
export function renderExpandableTab(state: AppViewState, tab: Tab) {
  if (!isExpandableTab(tab)) {
    return renderTab(state, tab);
  }

  const config = EXPANDABLE_TAB_CONFIG[tab];
  const isExpanded = state.navExpandedTabs.has(tab);
  const isActive = state.tab === tab;
  const href = pathForTab(tab, state.basePath);

  // Get sub-items based on tab type
  const subItems = getSubItemsForTab(state, tab);
  const visibleItems = subItems.slice(0, config.maxVisibleItems);
  const hasMore = subItems.length > config.maxVisibleItems;

  const handleTabClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    state.setTab(tab);
  };

  const handleExpandClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    state.handleNavExpandToggle(tab);
  };

  const handleAddClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    handleAddAction(state, tab);
  };

  const handleRefreshClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (tab === "chat") {
      void loadSessions(state);
    }
  };

  const handleToggleCronClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    state.applySettings({
      ...state.settings,
      chatHideCron: !state.settings.chatHideCron,
    });
  };

  return html`
    <div class="nav-item-expandable ${isExpanded ? "nav-item-expandable--expanded" : ""} ${isActive ? "nav-item-expandable--active" : ""}">
      <div class="nav-item-expandable__header">
        <a
          href=${href}
          class="nav-item ${isActive ? "active" : ""}"
          @click=${handleTabClick}
          title=${titleForTab(tab)}
        >
          <span class="nav-item__icon" aria-hidden="true">${icons[iconForTab(tab)]}</span>
          <span class="nav-item__text">${titleForTab(tab)}</span>
        </a>
        <div class="nav-item-expandable__actions">
          ${
            tab === "chat"
              ? html`
            <button
              class="nav-item-expandable__refresh ${state.settings.chatHideCron ? "active" : ""}"
              @click=${handleToggleCronClick}
              title=${state.settings.chatHideCron ? "Show cron chats" : "Hide cron chats"}
              aria-label=${state.settings.chatHideCron ? "Show cron chats" : "Hide cron chats"}
              style="margin-right: 4px;"
            >
              ${icons.clock}
            </button>
          `
              : nothing
          }
          ${
            config.hasAddButton
              ? html`
            <button
              class="nav-item-expandable__refresh"
              @click=${handleRefreshClick}
              title="Refresh list"
              aria-label="Refresh ${titleForTab(tab).toLowerCase()} list"
            >
              ${icons.refreshCw}
            </button>
            <button
              class="nav-item-expandable__add"
              @click=${handleAddClick}
              title="Add new"
              aria-label="Add new ${titleForTab(tab).toLowerCase()}"
            >
              ${icons.plus}
            </button>
          `
              : nothing
          }
          <button
            class="nav-item-expandable__toggle"
            @click=${handleExpandClick}
            aria-expanded=${isExpanded}
            title=${isExpanded ? "Collapse" : "Expand"}
          >
            <span class="nav-item-expandable__chevron">${isExpanded ? "▼" : "▶"}</span>
          </button>
        </div>
      </div>
      ${
        isExpanded && subItems.length > 0
          ? html`
        <div class="nav-subitems">
          ${visibleItems.map((item) => renderSubItem(state, tab, item))}
          ${
            hasMore
              ? html`
            <a
              href=${href}
              class="nav-subitem nav-subitem--more"
              @click=${handleTabClick}
            >
              <span class="nav-subitem__text">${config.showMoreLabel} (${subItems.length - config.maxVisibleItems} more)</span>
            </a>
          `
              : nothing
          }
        </div>
      `
          : nothing
      }
    </div>
  `;
}

/**
 * Get sub-items for a given expandable tab.
 * Currently only Chat is expandable - it shows sessions as sub-items,
 * replacing the need for a secondary sidebar.
 */
function getSubItemsForTab(state: AppViewState, tab: ExpandableTab): SubItem[] {
  switch (tab) {
    case "chat":
      return getChatSessionSubItems(state);
    default:
      return [];
  }
}

type SubItem = {
  key: string;
  label: string;
  sublabel?: string;
  active: boolean;
  status?: "ok" | "warning" | "error" | "inactive";
  /** If true, this item cannot be deleted (e.g., the Global session) */
  protected?: boolean;
  /** If true, this is the Global session with cross-session visibility */
  isGlobal?: boolean;
};

function getChatSessionSubItems(state: AppViewState): SubItem[] {
  const sessions = state.sessionsResult?.sessions ?? [];

  // Find the Global session if it exists, or create a placeholder
  const globalSession = sessions.find((s) => s.key === GLOBAL_KEY || s.kind === "global");

  // Filter to regular chat-type sessions (non-global) and sort by most recent
  const chatSessions = sessions
    .filter((s) => s.key !== GLOBAL_KEY && s.kind !== "global")
    .filter((s) => {
      if (state.settings.chatHideCron) {
        // Hide sessions that are associated with cron jobs
        if (s.cronJobs && s.cronJobs.length > 0) {
          return false;
        }
      }
      return true;
    })
    .toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  // Build the result array with Global session always first
  const result: SubItem[] = [];

  // Always add Global session first (even if not in server response)
  result.push({
    key: GLOBAL_KEY,
    label: GLOBAL_NAME,
    sublabel: globalSession?.updatedAt ? formatAgo(globalSession.updatedAt) : "Cross-session view",
    active: state.sessionKey === GLOBAL_KEY,
    protected: true,
    isGlobal: true,
  });

  // Add remaining sessions
  for (const session of chatSessions) {
    result.push({
      key: session.key,
      label: session.displayName ?? session.key,
      sublabel: session.updatedAt ? formatAgo(session.updatedAt) : undefined,
      active: session.key === state.sessionKey,
    });
  }

  return result;
}

/**
 * Render a sub-item in the navigation.
 */
function renderSubItem(state: AppViewState, tab: ExpandableTab, item: SubItem) {
  const handleClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    handleSubItemClick(state, tab, item.key);
  };

  const handleDeleteClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (tab === "chat" && !item.protected) {
      void state.handleDeleteSessionConfirm(item.key);
    }
  };

  const statusClass = item.status ? `nav-subitem--${item.status}` : "";
  const globalClass = item.isGlobal ? "nav-subitem--global" : "";

  // Show delete button for non-protected items in chat tab
  const canDelete = tab === "chat" && !item.protected;

  return html`
    <div class="nav-subitem-wrapper">
      <button
        class="nav-subitem ${item.active ? "nav-subitem--active" : ""} ${statusClass} ${globalClass}"
        @click=${handleClick}
        title=${item.isGlobal ? `${item.label} - View all session histories` : item.label}
      >
        ${item.isGlobal ? html`<span class="nav-subitem__global-icon" aria-hidden="true">${icons.globe}</span>` : nothing}
        ${
          item.status
            ? html`
                <span class="nav-subitem__status" aria-hidden="true"></span>
              `
            : nothing
        }
        <span class="nav-subitem__text">${item.label}</span>
        ${item.sublabel ? html`<span class="nav-subitem__sublabel">${item.sublabel}</span>` : nothing}
      </button>
      ${
        canDelete
          ? html`
        <button
          class="nav-subitem__delete"
          @click=${handleDeleteClick}
          title="Delete session"
          aria-label="Delete ${item.label}"
        >
          ${icons.trash}
        </button>
      `
          : nothing
      }
    </div>
  `;
}

/**
 * Handle clicking on a sub-item.
 * Currently only "chat" is expandable, so we switch to the selected session.
 */
function handleSubItemClick(state: AppViewState, _tab: ExpandableTab, key: string) {
  // Switch to this chat session
  state.sessionKey = key;
  state.chatMessage = "";
  state.chatAttachments = [];
  state.chatStream = null;
  state.chatStreamStartedAt = null;
  state.chatRunId = null;
  state.chatMessages = [];
  state.chatRecommendations = [];
  state.chatLoading = true;
  state.resetToolStream();
  state.resetChatScroll();
  state.applySettings({
    ...state.settings,
    sessionKey: key,
    lastActiveSessionKey: key,
  });
  void state.loadAssistantIdentity();
  void loadChatHistory(state);
  void refreshChat(state);
  state.setTab("chat");
}

/**
 * Handle the add button click for an expandable tab.
 * Currently only "chat" is expandable, so we create a new session.
 */
function handleAddAction(state: AppViewState, _tab: ExpandableTab) {
  void state.handleNewSession();
}
