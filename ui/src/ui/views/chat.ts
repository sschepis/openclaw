import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import type { SessionsListResult } from "../types";
import type { ActionMessage, ChatItem, MessageGroup } from "../types/chat-types";
import type { ChatAttachment, ChatQueueItem } from "../ui-types";
import {
  renderActionMessage,
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
} from "../chat/grouped-render";
import { normalizeMessage, normalizeRoleForGrouping } from "../chat/message-normalizer";
import { icons } from "../icons";
import { renderMarkdownSidebar } from "./markdown-sidebar";
import { renderChatSessions } from "./chat-sessions";
import { renderThinkingPanel, type ThinkingState } from "../components/thinking-panel";
import "../components/resizable-divider";

export type CompactionIndicatorStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

export type ChatProps = {
  sessionKey: string;
  onSessionKeyChange: (next: string) => void;
  thinkingLevel: string | null;
  showThinking: boolean;
  loading: boolean;
  sending: boolean;
  canAbort?: boolean;
  thinkingState?: ThinkingState | null;
  compactionStatus?: CompactionIndicatorStatus | null;
  messages: unknown[];
  toolMessages: unknown[];
  actionMessages?: ActionMessage[];
  stream: string | null;
  streamStartedAt: number | null;
  assistantAvatarUrl?: string | null;
  draft: string;
  queue: ChatQueueItem[];
  connected: boolean;
  canSend: boolean;
  disabledReason: string | null;
  error: string | null;
  sessions: SessionsListResult | null;
  // Focus mode
  focusMode: boolean;
  // Sidebar state
  sidebarOpen?: boolean;
  sidebarContent?: string | null;
  sidebarError?: string | null;
  splitRatio?: number;
  assistantName: string;
  assistantAvatar: string | null;
  // Image attachments
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  // Event handlers
  onRefresh: () => void;
  onToggleFocusMode: () => void;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAbort?: () => void;
  onQueueRemove: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (key: string) => void;
  onExportSession?: (key: string) => void;
  onDeleteMessage?: (id: string) => void;
  onDeleteFromMessage?: (id: string) => void;
  onRerunFromMessage?: (id: string) => void;
  onEditMessage?: (id: string, currentContent: string) => void;
  onCopyMessage?: (text: string) => void;
  onRenameSession?: (key: string, newName: string) => void;
  // Mobile sidebar state
  mobileSessionsOpen?: boolean;
  onToggleMobileSessions?: () => void;
  // Session search
  sessionSearchQuery?: string;
  onSessionSearchChange?: (query: string) => void;
  onOpenSidebar?: (content: string) => void;
  onCloseSidebar?: () => void;
  onSplitRatioChange?: (ratio: number) => void;
  onChatScroll?: (event: Event) => void;
  userNearBottom?: boolean;
  onScrollToBottom?: () => void;
  // Voice interface
  isListening?: boolean;
  onToggleMic?: () => void;
  onSpeak?: (text: string) => void;
  // File upload
  onFileUpload?: (file: File) => void;
  onSettings?: () => void;
};

const COMPACTION_TOAST_DURATION_MS = 5000;

function adjustTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function renderCompactionIndicator(status: CompactionIndicatorStatus | null | undefined) {
  if (!status) {
    return nothing;
  }

  // Show "compacting..." while active
  if (status.active) {
    return html`
      <div class="callout info compaction-indicator compaction-indicator--active">
        ${icons.loader} Compacting context...
      </div>
    `;
  }

  // Show "compaction complete" briefly after completion
  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return html`
        <div class="callout success compaction-indicator compaction-indicator--complete">
          ${icons.check} Context compacted
        </div>
      `;
    }
  }

  return nothing;
}

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Renders an editable session title that allows in-place editing on click.
 * Uses a contenteditable span that commits changes on blur or Enter key.
 */
function renderEditableSessionTitle(
  displayName: string,
  sessionKey: string,
  onRename?: (key: string, newName: string) => void,
) {
  if (!onRename) {
    // If no rename handler, just render a static title
    return html`<span class="chat-session-title" style="font-weight: 600;">${displayName}</span>`;
  }

  const handleKeydown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (e.key === "Enter") {
      e.preventDefault();
      target.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      target.textContent = displayName;
      target.blur();
    }
  };

  const handleBlur = (e: FocusEvent) => {
    const target = e.target as HTMLElement;
    const newName = target.textContent?.trim() ?? "";
    if (newName && newName !== displayName) {
      onRename(sessionKey, newName);
    } else {
      // Restore original name if empty or unchanged
      target.textContent = displayName;
    }
  };

  const handleFocus = (e: FocusEvent) => {
    const target = e.target as HTMLElement;
    // Select all text on focus for easy replacement
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  return html`
    <span
      class="chat-session-title chat-session-title--editable"
      contenteditable="true"
      spellcheck="false"
      @keydown=${handleKeydown}
      @blur=${handleBlur}
      @focus=${handleFocus}
      title="Click to edit session name"
    >${displayName}</span>
  `;
}

function handlePaste(e: ClipboardEvent, props: ChatProps, visionSupported: boolean) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) {
    return;
  }

  const imageItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      imageItems.push(item);
    }
  }

  if (imageItems.length === 0) {
    return;
  }

  if (!visionSupported) {
    return;
  }

  e.preventDefault();

  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) {
      continue;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
      };
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    });
    reader.readAsDataURL(file);
  }
}

function renderAttachmentPreview(props: ChatProps) {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-attachments">
      ${attachments.map(
        (att) => html`
          <div class="chat-attachment">
            <img
              src=${att.dataUrl}
              alt="Attachment preview"
              class="chat-attachment__img"
            />
            <button
              class="chat-attachment__remove"
              type="button"
              aria-label="Remove attachment"
              @click=${() => {
                const next = (props.attachments ?? []).filter((a) => a.id !== att.id);
                props.onAttachmentsChange?.(next);
              }}
            >
              ${icons.x}
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

export function renderChat(props: ChatProps) {
  const canCompose = props.connected;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);
  const activeSession = props.sessions?.sessions?.find((row) => row.key === props.sessionKey);
  const reasoningLevel = activeSession?.reasoningLevel ?? "off";
  const showReasoning = props.showThinking && reasoningLevel !== "off";
  // Default to true if capabilities are unknown (legacy behavior), unless we know it's missing
  const visionSupported = activeSession?.capabilities?.vision ?? true;

  const assistantIdentity = {
    name: props.assistantName,
    avatar: props.assistantAvatar ?? props.assistantAvatarUrl ?? null,
  };

  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const composePlaceholder = props.connected
    ? hasAttachments
      ? "Add a message or paste more images..."
      : visionSupported
        ? "Message (↩ to send, Shift+↩ for line breaks, paste images)"
        : "Message (↩ to send, Shift+↩ for line breaks)"
    : "Connect to the gateway to start chatting…";

  const splitRatio = props.splitRatio ?? 0.6;
  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);
  const chatItems = buildChatItems(props);
  const showEmptyState = !props.loading && chatItems.length === 0;

  const thread = html`
    <div
      class="chat-thread"
      role="log"
      aria-live="polite"
      @scroll=${props.onChatScroll}
    >
      ${
        props.loading
          ? html`
              <div style="padding: 20px; display: grid; gap: 20px;">
                ${[1, 2, 3].map(() => html`
                  <div style="display: flex; gap: 12px; align-items: flex-start;">
                    <div class="skeleton skeleton-circle" style="width: 32px; height: 32px; flex-shrink: 0;"></div>
                    <div style="flex: 1; display: grid; gap: 8px;">
                      <div class="skeleton skeleton-text" style="width: 120px;"></div>
                      <div class="skeleton skeleton-text"></div>
                      <div class="skeleton skeleton-text"></div>
                    </div>
                  </div>
                `)}
              </div>
            `
          : nothing
      }
      ${
        showEmptyState
          ? html`
              <div class="chat-empty-state">
                <div class="chat-empty-state__icon">${icons.messageSquare}</div>
                <div class="chat-empty-state__title">Start a new conversation</div>
                <div class="chat-empty-state__sub">Ask questions, generate code, or just chat.</div>
              </div>
            `
          : nothing
      }
      ${repeat(
        chatItems,
        (item) => item.key,
        (item) => {
          if (item.kind === "reading-indicator") {
            return renderReadingIndicatorGroup(assistantIdentity);
          }

          if (item.kind === "stream") {
            return renderStreamingGroup(
              item.text,
              item.startedAt,
              props.onOpenSidebar,
              assistantIdentity,
            );
          }

          if (item.kind === "action") {
            return renderActionMessage(item.action);
          }

          if (item.kind === "group") {
            return renderMessageGroup(item, {
              onOpenSidebar: props.onOpenSidebar,
              onDeleteMessage: props.onDeleteMessage,
              onDeleteFromMessage: props.onDeleteFromMessage,
              onRerunFromMessage: props.onRerunFromMessage,
              onEditMessage: props.onEditMessage,
              onCopyMessage: props.onCopyMessage,
              showReasoning,
              assistantName: props.assistantName,
              assistantAvatar: assistantIdentity.avatar,
            });
          }

          return nothing;
        },
      )}
    </div>
  `;

  return html`
    <section class="card chat chat-layout-wrapper">
      <div class="chat-sessions-pane ${props.mobileSessionsOpen ? "chat-sessions-pane--open" : ""}">
        ${renderChatSessions({
          sessions: props.sessions,
          activeSessionKey: props.sessionKey,
          onSelect: (key) => {
            props.onSessionKeyChange(key);
            if (props.mobileSessionsOpen && props.onToggleMobileSessions) {
              props.onToggleMobileSessions();
            }
          },
          onNewSession: () => {
            props.onNewSession();
            if (props.mobileSessionsOpen && props.onToggleMobileSessions) {
              props.onToggleMobileSessions();
            }
          },
          onDeleteSession: props.onDeleteSession,
          loading: props.loading && !props.sessions,
          searchQuery: props.sessionSearchQuery ?? "",
          onSearchChange: props.onSessionSearchChange,
          mobileOpen: props.mobileSessionsOpen,
          onCloseMobile: props.onToggleMobileSessions,
        })}
      </div>

      <div class="chat-main-pane">
        <div class="chat-header">
          <div class="chat-header__left">
            <button
              class="btn--icon chat-mobile-toggle"
              @click=${props.onToggleMobileSessions}
              aria-label="Open sessions"
            >
              ${icons.menu}
            </button>
            ${renderEditableSessionTitle(
              activeSession?.displayName ?? "New Session",
              props.sessionKey,
              props.onRenameSession,
            )}
          </div>
          <div class="chat-header__right">
            <button
              class="btn--icon"
              @click=${props.onSettings}
              title="Session Settings"
            >
              ${icons.settings}
            </button>
          </div>
        </div>

        ${props.disabledReason ? html`<div class="callout">${props.disabledReason}</div>` : nothing}

        ${props.error ? html`
          <div class="callout danger" style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
            <span>${props.error}</span>
            <button class="btn sm" @click=${props.onSend} ?disabled=${props.sending}>
              ${icons.zap} Retry
            </button>
          </div>
        ` : nothing}

        ${props.thinkingState ? renderThinkingPanel(props.thinkingState) : nothing}

        ${renderCompactionIndicator(props.compactionStatus)}

        ${
          props.focusMode
            ? html`
              <button
                class="chat-focus-exit"
                type="button"
                @click=${props.onToggleFocusMode}
                aria-label="Exit focus mode"
                title="Exit focus mode"
              >
                ${icons.x}
              </button>
            `
            : nothing
        }

        <div
          class="chat-split-container ${sidebarOpen ? "chat-split-container--open" : ""}"
        >
        <div
          class="chat-main"
          style="flex: ${sidebarOpen ? `0 0 ${splitRatio * 100}%` : "1 1 100%"}"
        >
          ${thread}
        </div>

        ${
          sidebarOpen
            ? html`
              <resizable-divider
                .splitRatio=${splitRatio}
                @resize=${(e: CustomEvent) => props.onSplitRatioChange?.(e.detail.splitRatio)}
              ></resizable-divider>
              <div class="chat-sidebar">
                ${renderMarkdownSidebar({
                  content: props.sidebarContent ?? null,
                  error: props.sidebarError ?? null,
                  onClose: props.onCloseSidebar!,
                  onViewRawText: () => {
                    if (!props.sidebarContent || !props.onOpenSidebar) {
                      return;
                    }
                    props.onOpenSidebar(`\`\`\`\n${props.sidebarContent}\n\`\`\``);
                  },
                })}
              </div>
            `
            : nothing
        }
      </div>

      ${
        props.queue.length
          ? html`
            <div class="chat-queue" role="status" aria-live="polite">
              <div class="chat-queue__title">Queued (${props.queue.length})</div>
              <div class="chat-queue__list">
                ${props.queue.map(
                  (item) => html`
                    <div class="chat-queue__item">
                      <div class="chat-queue__text">
                        ${
                          item.text ||
                          (item.attachments?.length ? `Image (${item.attachments.length})` : "")
                        }
                      </div>
                      <button
                        class="btn chat-queue__remove"
                        type="button"
                        aria-label="Remove queued message"
                        @click=${() => props.onQueueRemove(item.id)}
                      >
                        ${icons.x}
                      </button>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
          : nothing
      }

        ${
          !props.userNearBottom && props.onScrollToBottom
            ? html`
              <button
                class="chat-scroll-bottom"
                @click=${props.onScrollToBottom}
                aria-label="Scroll to bottom"
              >
                ${icons.arrowDown}
              </button>
            `
            : nothing
        }

        <div class="chat-compose">
          ${renderAttachmentPreview(props)}
          <div class="chat-compose__row">
            ${props.onFileUpload && visionSupported
              ? html`
                <input
                  type="file"
                  id="chat-file-input"
                  style="display: none"
                  @change=${(e: Event) => {
                    const input = e.target as HTMLInputElement;
                    const file = input.files?.[0];
                    if (file && props.onFileUpload) {
                      props.onFileUpload(file);
                    }
                    input.value = "";
                  }}
                />
                <button
                  class="btn--icon"
                  style="align-self: flex-end; margin-bottom: 2px;"
                  @click=${() => {
                    const input = document.getElementById("chat-file-input");
                    input?.click();
                  }}
                  title="Attach file"
                >
                  ${icons.paperclip}
                </button>
              ` 
              : nothing
            }
            <label class="field chat-compose__field">
              <span>Message</span>
              <textarea
                ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
                .value=${props.draft}
                ?disabled=${!props.connected}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key !== "Enter") {
                    return;
                  }
                  if (e.isComposing || e.keyCode === 229) {
                    return;
                  }
                  if (e.shiftKey) {
                    return;
                  } // Allow Shift+Enter for line breaks
                  if (!props.connected) {
                    return;
                  }
                  e.preventDefault();
                  if (canCompose) {
                    props.onSend();
                  }
                }}
                @input=${(e: Event) => {
                  const target = e.target as HTMLTextAreaElement;
                  adjustTextareaHeight(target);
                  props.onDraftChange(target.value);
                }}
                @paste=${(e: ClipboardEvent) => handlePaste(e, props, visionSupported)}
                placeholder=${composePlaceholder}
              ></textarea>
            </label>
            <div class="chat-compose__actions">
              ${props.onToggleMic 
                ? html`
                  <button
                    class="btn--icon"
                    @click=${props.onToggleMic}
                    title=${props.isListening ? "Stop listening" : "Start listening"}
                    style=${props.isListening ? "color: var(--accent); border-color: var(--accent);" : ""}
                  >
                    ${props.isListening ? icons.micOff : icons.mic}
                  </button>
                ` 
                : nothing
              }
              <button
                class="btn"
                ?disabled=${!props.connected || (!canAbort && props.sending)}
                @click=${canAbort ? props.onAbort : props.onNewSession}
              >
                ${canAbort ? "Stop" : "New session"}
              </button>
              <button
                class="btn primary"
                ?disabled=${!props.connected}
                @click=${props.onSend}
              >
                ${isBusy ? "Queue" : "Send"}<kbd class="btn-kbd">↵</kbd>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

const CHAT_HISTORY_RENDER_LIMIT = 200;

function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  const result: Array<ChatItem | MessageGroup> = [];
  let currentGroup: MessageGroup | null = null;

  for (const item of items) {
    if (item.kind !== "message") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }
      result.push(item);
      continue;
    }

    const normalized = normalizeMessage(item.message);
    const role = normalizeRoleForGrouping(normalized.role);
    const timestamp = normalized.timestamp || Date.now();

    if (!currentGroup || currentGroup.role !== role) {
      if (currentGroup) {
        result.push(currentGroup);
      }
      currentGroup = {
        kind: "group",
        key: `group:${role}:${item.key}`,
        role,
        messages: [{ message: item.message, key: item.key }],
        timestamp,
        isStreaming: false,
      };
    } else {
      currentGroup.messages.push({ message: item.message, key: item.key });
    }
  }

  if (currentGroup) {
    result.push(currentGroup);
  }
  return result;
}

function buildChatItems(props: ChatProps): Array<ChatItem | MessageGroup> {
  const items: ChatItem[] = [];
  const history = Array.isArray(props.messages) ? props.messages : [];
  const tools = Array.isArray(props.toolMessages) ? props.toolMessages : [];
  const actions = Array.isArray(props.actionMessages) ? props.actionMessages : [];
  const historyStart = Math.max(0, history.length - CHAT_HISTORY_RENDER_LIMIT);
  if (historyStart > 0) {
    items.push({
      kind: "message",
      key: "chat:history:notice",
      message: {
        role: "system",
        content: `Showing last ${CHAT_HISTORY_RENDER_LIMIT} messages (${historyStart} hidden).`,
        timestamp: Date.now(),
      },
    });
  }

  // Collect all items with timestamps for proper ordering
  type TimestampedItem =
    | { type: "message"; msg: unknown; index: number; ts: number }
    | { type: "action"; action: ActionMessage; ts: number };

  const allItems: TimestampedItem[] = [];

  // Add regular messages
  for (let i = historyStart; i < history.length; i++) {
    const msg = history[i];
    const normalized = normalizeMessage(msg);

    if (!props.showThinking && normalized.role.toLowerCase() === "toolresult") {
      continue;
    }

    allItems.push({
      type: "message",
      msg,
      index: i,
      ts: normalized.timestamp || 0,
    });
  }

  // Add action messages
  for (const action of actions) {
    allItems.push({
      type: "action",
      action,
      ts: action.timestamp,
    });
  }

  // Sort by timestamp
  allItems.sort((a, b) => a.ts - b.ts);

  // Build items array
  for (const item of allItems) {
    if (item.type === "message") {
      items.push({
        kind: "message",
        key: messageKey(item.msg, item.index),
        message: item.msg,
      });
    } else {
      items.push({
        kind: "action",
        key: `action:${item.action.type}:${item.ts}`,
        action: item.action,
      });
    }
  }

  if (props.showThinking) {
    for (let i = 0; i < tools.length; i++) {
      items.push({
        kind: "message",
        key: messageKey(tools[i], i + history.length),
        message: tools[i],
      });
    }
  }

  if (props.stream !== null) {
    const key = `stream:${props.sessionKey}:${props.streamStartedAt ?? "live"}`;
    if (props.stream.trim().length > 0) {
      items.push({
        kind: "stream",
        key,
        text: props.stream,
        startedAt: props.streamStartedAt ?? Date.now(),
      });
    } else {
      items.push({ kind: "reading-indicator", key });
    }
  }

  return groupMessages(items);
}

function messageKey(message: unknown, index: number): string {
  const m = message as Record<string, unknown>;
  const toolCallId = typeof m.toolCallId === "string" ? m.toolCallId : "";
  if (toolCallId) {
    return `tool:${toolCallId}`;
  }
  const id = typeof m.id === "string" ? m.id : "";
  if (id) {
    return `msg:${id}`;
  }
  const messageId = typeof m.messageId === "string" ? m.messageId : "";
  if (messageId) {
    return `msg:${messageId}`;
  }
  const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
  const role = typeof m.role === "string" ? m.role : "unknown";
  if (timestamp != null) {
    return `msg:${role}:${timestamp}:${index}`;
  }
  return `msg:${role}:${index}`;
}
