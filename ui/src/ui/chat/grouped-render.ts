import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { ref } from "lit/directives/ref.js";
import type { AssistantIdentity } from "../assistant-identity";
import type { CanvasVisualization } from "../components/canvas-visualization";
import type { ThinkingState } from "../components/thinking-panel";
import type { ActionMessage, MessageGroup } from "../types/chat-types";
import { icons } from "../icons";
import { toSanitizedMarkdownHtml } from "../markdown";
import { renderCanvasBlocksFromContent, hasCanvasContent } from "./canvas-render";
import { renderCopyAsMarkdownButton } from "./copy-as-markdown";
import { withCopyButtons } from "../directives/with-copy-buttons";
import {
  extractTextCached,
  extractThinkingCached,
  formatReasoningMarkdown,
} from "./message-extract";
import { isToolResultMessage, normalizeRoleForGrouping } from "./message-normalizer";
import { extractToolCards, renderToolCardSidebar } from "./tool-cards";

type ImageBlock = {
  url: string;
  alt?: string;
};

function extractImages(message: unknown): ImageBlock[] {
  const m = message as Record<string, unknown>;
  const content = m.content;
  const images: ImageBlock[] = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== "object" || block === null) {
        continue;
      }
      const b = block as Record<string, unknown>;

      if (b.type === "image") {
        // Handle source object format (from sendChatMessage)
        const source = b.source as Record<string, unknown> | undefined;
        if (source?.type === "base64" && typeof source.data === "string") {
          const data = source.data;
          const mediaType = (source.media_type as string) || "image/png";
          // If data is already a data URL, use it directly
          const url = data.startsWith("data:") ? data : `data:${mediaType};base64,${data}`;
          images.push({ url });
        } else if (typeof b.url === "string") {
          images.push({ url: b.url });
        }
      } else if (b.type === "image_url") {
        // OpenAI format
        const imageUrl = b.image_url as Record<string, unknown> | undefined;
        if (typeof imageUrl?.url === "string") {
          images.push({ url: imageUrl.url });
        }
      }
    }
  }

  return images;
}

export function renderReadingIndicatorGroup(
  assistant?: AssistantIdentity,
  thinkingState?: ThinkingState | null,
) {
  // Extract status text from thinking state
  const activeAction = thinkingState?.actions.find((a) => a.status === "running");
  const statusText = activeAction?.label
    ? `${activeAction.label}...`
    : thinkingState?.status || "Thinking...";

  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        <div class="chat-bubble chat-reading-indicator" aria-hidden="true">
          <span class="chat-reading-indicator__dots">
            <span></span><span></span><span></span>
          </span>
          <span class="chat-reading-indicator__status">${statusText}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderStreamingGroup(
  text: string,
  startedAt: number,
  onOpenSidebar?: (content: string) => void,
  assistant?: AssistantIdentity,
  thinkingState?: ThinkingState | null,
) {
  const timestamp = new Date(startedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const name = assistant?.name ?? "Assistant";

  // Extract status text from thinking state
  const activeAction = thinkingState?.actions.find((a) => a.status === "running");
  const statusText = activeAction?.label
    ? `${activeAction.label}...`
    : thinkingState?.status || null;

  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        ${renderGroupedMessage(
          {
            role: "assistant",
            content: [{ type: "text", text }],
            timestamp: startedAt,
          },
          "stream:active",
          { isStreaming: true, showReasoning: false },
          onOpenSidebar,
        )}
        ${
          statusText
            ? html`
            <div class="chat-streaming-status">
              <span class="chat-streaming-status__dots">
                <span></span><span></span><span></span>
              </span>
              <span class="chat-streaming-status__text">${statusText}</span>
            </div>
          `
            : nothing
        }
        <div class="chat-group-footer">
          <span class="chat-sender-name">${name}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderMessageGroup(
  group: MessageGroup,
  opts: {
    onOpenSidebar?: (content: string) => void;
    onDeleteMessage?: (id: string) => void;
    onDeleteFromMessage?: (id: string) => void;
    onRerunFromMessage?: (id: string) => void;
    onEditMessage?: (id: string, currentContent: string) => void;
    onCopyMessage?: (text: string) => void;
    onSpeak?: (text: string) => void;
    onAddVisualization?: (viz: CanvasVisualization, sessionKey: string) => void;
    showReasoning: boolean;
    assistantName?: string;
    assistantAvatar?: string | null;
    sessionKey?: string;
  },
) {
  const normalizedRole = normalizeRoleForGrouping(group.role);
  const assistantName = opts.assistantName ?? "Assistant";
  const who =
    normalizedRole === "user"
      ? "You"
      : normalizedRole === "assistant"
        ? assistantName
        : normalizedRole;
  const roleClass =
    normalizedRole === "user" ? "user" : normalizedRole === "assistant" ? "assistant" : "other";
  const timestamp = new Date(group.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return html`
    <div class="chat-group ${roleClass}">
      ${renderAvatar(group.role, {
        name: assistantName,
        avatar: opts.assistantAvatar ?? null,
      })}
      <div class="chat-group-messages">
        ${group.messages.map((item, index) =>
          renderGroupedMessage(
            item.message,
            item.key,
            {
              isStreaming: group.isStreaming && index === group.messages.length - 1,
              showReasoning: opts.showReasoning,
              role: group.role,
              sessionKey: opts.sessionKey,
            },
            opts.onOpenSidebar,
            opts.onDeleteMessage,
            opts.onDeleteFromMessage,
            opts.onRerunFromMessage,
            opts.onEditMessage,
            opts.onCopyMessage,
            opts.onSpeak,
            opts.onAddVisualization,
          ),
        )}
        <div class="chat-group-footer">
          <span class="chat-sender-name">${who}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

function renderAvatar(role: string, assistant?: Pick<AssistantIdentity, "name" | "avatar">) {
  const normalized = normalizeRoleForGrouping(role);
  const assistantName = assistant?.name?.trim() || "Assistant";
  const assistantAvatar = assistant?.avatar?.trim() || "";
  const initial =
    normalized === "user"
      ? "U"
      : normalized === "assistant"
        ? assistantName.charAt(0).toUpperCase() || "A"
        : normalized === "tool"
          ? "⚙"
          : "?";
  const className =
    normalized === "user"
      ? "user"
      : normalized === "assistant"
        ? "assistant"
        : normalized === "tool"
          ? "tool"
          : "other";

  if (assistantAvatar && normalized === "assistant") {
    if (isAvatarUrl(assistantAvatar)) {
      return html`<img
        class="chat-avatar ${className}"
        src="${assistantAvatar}"
        alt="${assistantName}"
        @error=${(e: Event) => {
          // On load error, replace with OpenClaw icon
          const img = e.target as HTMLImageElement;
          const parent = img.parentElement;
          if (parent) {
            const fallback = document.createElement("div");
            fallback.className = `chat-avatar ${className} chat-avatar--icon`;
            // Use the inline SVG from icons
            fallback.innerHTML = `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="lobster-gradient-avatar" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#ff4d4d"/>
                  <stop offset="100%" stop-color="#991b1b"/>
                </linearGradient>
              </defs>
              <path d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z" fill="url(#lobster-gradient-avatar)"/>
              <path d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z" fill="url(#lobster-gradient-avatar)"/>
              <path d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z" fill="url(#lobster-gradient-avatar)"/>
              <path d="M45 15 Q35 5 30 8" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/>
              <path d="M75 15 Q85 5 90 8" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/>
              <circle cx="45" cy="35" r="6" fill="#050810"/>
              <circle cx="75" cy="35" r="6" fill="#050810"/>
              <circle cx="46" cy="34" r="2.5" fill="#00e5cc"/>
              <circle cx="76" cy="34" r="2.5" fill="#00e5cc"/>
            </svg>`;
            parent.replaceChild(fallback, img);
          }
        }}
      />`;
    }
    return html`<div class="chat-avatar ${className}">${assistantAvatar}</div>`;
  }

  // For assistant without avatar, use the OpenClaw icon
  if (normalized === "assistant") {
    return html`<div class="chat-avatar ${className} chat-avatar--icon">${icons.openclaw}</div>`;
  }

  return html`<div class="chat-avatar ${className}">${initial}</div>`;
}

function isAvatarUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) || /^data:image\//i.test(value) || value.startsWith("/") // Relative paths from avatar endpoint
  );
}

function renderMessageImages(images: ImageBlock[]) {
  if (images.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-message-images">
      ${images.map(
        (img) => html`
          <img
            src=${img.url}
            alt=${img.alt ?? "Attached image"}
            class="chat-message-image"
            @click=${() => window.open(img.url, "_blank")}
          />
        `,
      )}
    </div>
  `;
}

function renderGroupedMessage(
  message: unknown,
  key: string,
  opts: { isStreaming: boolean; showReasoning: boolean; role?: string; sessionKey?: string },
  onOpenSidebar?: (content: string) => void,
  onDeleteMessage?: (id: string) => void,
  onDeleteFromMessage?: (id: string) => void,
  onRerunFromMessage?: (id: string) => void,
  onEditMessage?: (id: string, currentContent: string) => void,
  onCopyMessage?: (text: string) => void,
  onSpeak?: (text: string) => void,
  onAddVisualization?: (viz: CanvasVisualization, sessionKey: string) => void,
) {
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "unknown";
  const isToolResult =
    isToolResultMessage(message) ||
    role.toLowerCase() === "toolresult" ||
    role.toLowerCase() === "tool_result" ||
    typeof m.toolCallId === "string" ||
    typeof m.tool_call_id === "string";

  const toolCards = extractToolCards(message);
  const hasToolCards = toolCards.length > 0;
  const images = extractImages(message);
  const hasImages = images.length > 0;

  const extractedText = extractTextCached(message);
  const extractedThinking =
    opts.showReasoning && role === "assistant" ? extractThinkingCached(message) : null;
  const markdownBase = extractedText?.trim() ? extractedText : null;
  const reasoningMarkdown = extractedThinking ? formatReasoningMarkdown(extractedThinking) : null;
  const markdown = markdownBase;
  const hasCopyableContent = Boolean(markdown?.trim());
  const isUserMessage = normalizeRoleForGrouping(opts.role ?? role) === "user";
  const isAssistantMessage = normalizeRoleForGrouping(opts.role ?? role) === "assistant";

  // Check for canvas blocks in the message
  const hasCanvasBlocks = markdown ? hasCanvasContent(markdown) : false;

  // Extract ID from key (msg:ID or similar)
  const messageId = key.startsWith("msg:") ? key.slice(4).split(":")[0] : null;

  const bubbleClasses = [
    "chat-bubble",
    hasCopyableContent ? "has-copy" : "",
    opts.isStreaming ? "streaming" : "",
    "fade-in",
  ]
    .filter(Boolean)
    .join(" ");

  if (!markdown && hasToolCards && isToolResult) {
    return html`${toolCards.map((card) => renderToolCardSidebar(card, onOpenSidebar))}`;
  }

  if (!markdown && !hasToolCards && !hasImages) {
    return nothing;
  }

  return html`
    <div class="${bubbleClasses}">
      <div class="chat-actions">
        ${
          hasCopyableContent && markdown
            ? html`
              <button
                class="chat-action-btn"
                title="Copy message"
                @click=${() => {
                  if (onCopyMessage) {
                    onCopyMessage(markdown);
                  } else {
                    void navigator.clipboard.writeText(markdown);
                  }
                }}
              >
                ${icons.copy}
              </button>
            `
            : nothing
        }
        ${isAssistantMessage && hasCopyableContent ? renderCopyAsMarkdownButton(markdown!) : nothing}
        ${
          onSpeak && markdown
            ? html`
              <button
                class="chat-action-btn"
                title="Speak message"
                @click=${() => onSpeak(markdown)}
              >
                ${icons.volume2}
              </button>
            `
            : nothing
        }
        ${
          isUserMessage && messageId && onEditMessage && markdown
            ? html`
              <button
                class="chat-action-btn"
                title="Edit message"
                @click=${() => onEditMessage(messageId, markdown)}
              >
                ${icons.pencil}
              </button>
            `
            : nothing
        }
        ${
          isUserMessage && messageId && onRerunFromMessage
            ? html`
              <button
                class="chat-action-btn"
                title="Re-run from here"
                @click=${() => onRerunFromMessage(messageId)}
              >
                ${icons.refreshCw}
              </button>
            `
            : nothing
        }
        ${
          messageId && onDeleteFromMessage
            ? html`
              <button
                class="chat-action-btn warning"
                title="Delete this and all following messages"
                @click=${() => onDeleteFromMessage(messageId)}
              >
                ${icons.scissors}
              </button>
            `
            : nothing
        }
        ${
          messageId && onDeleteMessage
            ? html`
              <button
                class="chat-action-btn delete"
                title="Delete message"
                @click=${() => onDeleteMessage(messageId)}
              >
                ${icons.trash}
              </button>
            `
            : nothing
        }
      </div>
      ${renderMessageImages(images)}
      ${
        reasoningMarkdown
          ? html`<div class="chat-thinking" ${ref(withCopyButtons())}>${unsafeHTML(
              toSanitizedMarkdownHtml(reasoningMarkdown),
            )}</div>`
          : nothing
      }
      ${
        markdown
          ? html`<div class="chat-text" ${ref(withCopyButtons())}>${unsafeHTML(toSanitizedMarkdownHtml(markdown))}</div>`
          : nothing
      }
      ${
        hasCanvasBlocks && markdown
          ? renderCanvasBlocksFromContent(markdown, key, onAddVisualization, opts.sessionKey)
          : nothing
      }
      ${toolCards.map((card) => renderToolCardSidebar(card, onOpenSidebar))}
    </div>
  `;
}

/**
 * Renders an action message (e.g., cron job created, session renamed).
 * These are visually distinct from regular chat messages.
 */
export function renderActionMessage(action: ActionMessage) {
  const timestamp = new Date(action.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  // Choose icon and color based on action type
  const iconMap: Record<ActionMessage["type"], typeof icons.calendarClock> = {
    "cron-created": icons.calendarClock,
    "cron-updated": icons.clock,
    "cron-removed": icons.trash,
    "session-renamed": icons.pencil,
    generic: icons.info,
  };

  const colorClassMap: Record<ActionMessage["type"], string> = {
    "cron-created": "action--success",
    "cron-updated": "action--info",
    "cron-removed": "action--warning",
    "session-renamed": "action--info",
    generic: "action--info",
  };

  const icon = iconMap[action.type] ?? icons.info;
  const colorClass = colorClassMap[action.type] ?? "action--info";

  // Format details if present
  const detailEntries = action.details
    ? Object.entries(action.details).filter(([, v]) => v !== undefined)
    : [];

  return html`
    <div class="chat-action-message ${colorClass} fade-in">
      <div class="chat-action-message__icon">${icon}</div>
      <div class="chat-action-message__content">
        <div class="chat-action-message__title">${action.title}</div>
        ${
          action.description
            ? html`<div class="chat-action-message__description">${action.description}</div>`
            : nothing
        }
        ${
          detailEntries.length > 0
            ? html`
              <div class="chat-action-message__details">
                ${detailEntries.map(
                  ([key, value]) => html`
                    <span class="chat-action-message__detail">
                      <span class="chat-action-message__detail-key">${key}:</span>
                      <span class="chat-action-message__detail-value">${value}</span>
                    </span>
                  `,
                )}
              </div>
            `
            : nothing
        }
      </div>
      <div class="chat-action-message__timestamp">${timestamp}</div>
    </div>
  `;
}
