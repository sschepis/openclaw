import { html, nothing } from "lit";
import type { GatewaySessionRow, SessionsListResult } from "../types";
import { formatAgo } from "../format";
import { icons } from "../icons";
import { GLOBAL_SESSION_KEY, GLOBAL_SESSION_DISPLAY_NAME } from "../types";

export type ChatSessionsProps = {
  sessions: SessionsListResult | null;
  activeSessionKey: string;
  onSelect: (key: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (key: string) => void;
  onExportSession?: (key: string) => void;
  onRenameSession?: (key: string, newName: string) => void;
  loading: boolean;
  searchQuery: string;
  onSearchChange?: (query: string) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

/**
 * Renders an editable session name in the session list.
 * Double-click to edit, or click the edit button.
 */
function renderEditableSessionName(
  displayName: string,
  sessionKey: string,
  onRename?: (key: string, newName: string) => void,
) {
  if (!onRename) {
    // If no rename handler, just render a static name
    return html`<div class="chat-session-item__name" title=${displayName}>${displayName}</div>`;
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
    // Stop propagation to prevent selecting the session
    e.stopPropagation();
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

  const handleClick = (e: MouseEvent) => {
    // Stop propagation when clicking on the editable area
    e.stopPropagation();
  };

  return html`
    <div
      class="chat-session-item__name chat-session-item__name--editable"
      contenteditable="true"
      spellcheck="false"
      title="Click to edit"
      @keydown=${handleKeydown}
      @blur=${handleBlur}
      @focus=${handleFocus}
      @click=${handleClick}
    >${displayName}</div>
  `;
}

/**
 * Helper to check if a session is the protected Global session.
 */
function isGlobalSession(session: GatewaySessionRow): boolean {
  return session.key === GLOBAL_SESSION_KEY || session.kind === "global";
}

/**
 * Renders a single session item in the list.
 */
function renderSessionItem(session: GatewaySessionRow, props: ChatSessionsProps) {
  const isActive = session.key === props.activeSessionKey;
  const isGlobal = isGlobalSession(session);
  const displayName = isGlobal ? GLOBAL_SESSION_DISPLAY_NAME : (session.displayName ?? session.key);
  const updated = session.updatedAt ? formatAgo(session.updatedAt) : "";

  // Global session cannot be renamed
  const canRename = !isGlobal && props.onRenameSession;
  // Global session cannot be deleted
  const canDelete = !isGlobal && props.onDeleteSession;

  return html`
    <div class="chat-session-item-wrapper ${isActive ? "active" : ""} ${isGlobal ? "chat-session-item-wrapper--global" : ""}">
      <button
        class="chat-session-item ${isGlobal ? "chat-session-item--global" : ""}"
        @click=${() => props.onSelect(session.key)}
      >
        ${isGlobal ? html`<span class="chat-session-item__global-icon" aria-hidden="true">${icons.globe}</span>` : nothing}
        ${
          canRename
            ? renderEditableSessionName(displayName, session.key, props.onRenameSession)
            : html`<div class="chat-session-item__name" title=${displayName}>${displayName}</div>`
        }
        <div class="chat-session-item__meta">
          ${isGlobal ? "All sessions" : updated}
        </div>
      </button>
      ${
        canRename
          ? html`
          <button
            class="chat-session-item__delete"
            style="margin-right: 0;"
            title="Rename Session"
            @click=${(e: Event) => {
              e.stopPropagation();
              // Find the editable element and focus it
              const wrapper = (e.target as HTMLElement).closest(".chat-session-item-wrapper");
              const editable = wrapper?.querySelector(".chat-session-item__name--editable");
              if (editable) {
                (editable as HTMLElement).focus();
              }
            }}
          >
            ${icons.penLine}
          </button>
        `
          : nothing
      }
      ${
        props.onExportSession
          ? html`
          <button
            class="chat-session-item__delete"
            style="margin-right: 0;"
            title="Export Session"
            @click=${(e: Event) => {
              e.stopPropagation();
              props.onExportSession?.(session.key);
            }}
          >
            ${icons.download}
          </button>
        `
          : nothing
      }
      ${
        canDelete
          ? html`
          <button
            class="chat-session-item__delete"
            title="Delete Session"
            @click=${(e: Event) => {
              e.stopPropagation();
              props.onDeleteSession?.(session.key);
            }}
          >
            ${icons.trash}
          </button>
        `
          : nothing
      }
    </div>
  `;
}

export function renderChatSessions(props: ChatSessionsProps) {
  const sessions = props.sessions?.sessions ?? [];
  const query = props.searchQuery.trim().toLowerCase();

  // Separate Global session from regular sessions
  const globalSession = sessions.find(isGlobalSession);
  const regularSessions = sessions.filter((s) => !isGlobalSession(s));

  // Filter sessions based on search query
  const filteredRegularSessions = query
    ? regularSessions.filter((s) => {
        const name = (s.displayName ?? s.key).toLowerCase();
        return name.includes(query);
      })
    : regularSessions;

  // Check if Global session matches search (always show if no query or if "global" matches)
  const showGlobal = !query || GLOBAL_SESSION_DISPLAY_NAME.toLowerCase().includes(query);

  // Create a placeholder Global session if it doesn't exist in the data
  const globalSessionToRender: GatewaySessionRow = globalSession ?? {
    key: GLOBAL_SESSION_KEY,
    kind: "global",
    displayName: GLOBAL_SESSION_DISPLAY_NAME,
    updatedAt: null,
  };

  return html`
    <div class="chat-sessions ${props.mobileOpen ? "chat-sessions--mobile-open" : ""}">
      <div class="chat-sessions__header">
        <div class="chat-sessions__title">Sessions</div>
        <div class="chat-sessions__actions">
          <button
            class="btn sm"
            @click=${props.onNewSession}
            title="New Session"
            aria-label="Create new session"
          >
            ${icons.plus}
          </button>
          ${
            props.mobileOpen && props.onCloseMobile
              ? html`
              <button
                class="btn sm chat-sessions__close"
                @click=${props.onCloseMobile}
                title="Close Sidebar"
                aria-label="Close session sidebar"
              >
                ${icons.x}
              </button>
            `
              : nothing
          }
        </div>
      </div>

      <div class="chat-sessions__search">
        <div class="field">
          <input
            type="text"
            placeholder="Search sessions..."
            aria-label="Search sessions"
            .value=${props.searchQuery}
            @input=${(e: Event) => props.onSearchChange?.((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>
      
      <div class="chat-sessions__list">
        ${
          props.loading && sessions.length === 0
            ? html`
              <div style="padding: 8px; display: grid; gap: 8px;">
                ${[1, 2, 3, 4, 5].map(
                  () => html`
                    <div class="skeleton" style="height: 48px; width: 100%"></div>
                  `,
                )}
              </div>
            `
            : nothing
        }
        
        ${
          /* Always render Global session first if it matches the search */
          showGlobal ? renderSessionItem(globalSessionToRender, props) : nothing
        }
        
        ${
          /* Render regular sessions */
          filteredRegularSessions.map((session) => renderSessionItem(session, props))
        }
        
        ${
          !props.loading && !showGlobal && filteredRegularSessions.length === 0
            ? html`<div class="muted" style="padding: 8px;">
              ${query ? "No matching sessions." : "No sessions found."}
            </div>`
            : nothing
        }
      </div>
    </div>
  `;
}
