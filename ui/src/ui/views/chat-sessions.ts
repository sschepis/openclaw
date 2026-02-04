import { html, nothing } from "lit";
import type { GatewaySessionRow, SessionsListResult } from "../types";
import { formatAgo } from "../format";
import { icons } from "../icons";

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

export function renderChatSessions(props: ChatSessionsProps) {
  const sessions = props.sessions?.sessions ?? [];
  const query = props.searchQuery.trim().toLowerCase();
  
  const filteredSessions = query 
    ? sessions.filter(s => {
        const name = (s.displayName ?? s.key).toLowerCase();
        return name.includes(query);
      })
    : sessions;

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
          ${props.mobileOpen && props.onCloseMobile 
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
        ${props.loading && sessions.length === 0 
          ? html`
              <div style="padding: 8px; display: grid; gap: 8px;">
                ${[1, 2, 3, 4, 5].map(() => html`
                  <div class="skeleton" style="height: 48px; width: 100%;"></div>
                `)}
              </div>
            ` 
          : nothing
        }
        
        ${filteredSessions.map(session => {
          const isActive = session.key === props.activeSessionKey;
          const displayName = session.displayName ?? session.key;
          const updated = session.updatedAt ? formatAgo(session.updatedAt) : "";
          
          return html`
            <div class="chat-session-item-wrapper ${isActive ? "active" : ""}">
              <button
                class="chat-session-item"
                @click=${() => props.onSelect(session.key)}
              >
                ${renderEditableSessionName(displayName, session.key, props.onRenameSession)}
                <div class="chat-session-item__meta">
                  ${updated}
                </div>
              </button>
              ${props.onRenameSession
                ? html`
                  <button
                    class="chat-session-item__delete"
                    style="margin-right: 0;"
                    title="Rename Session"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      // Find the editable element and focus it
                      const wrapper = (e.target as HTMLElement).closest('.chat-session-item-wrapper');
                      const editable = wrapper?.querySelector('.chat-session-item__name--editable');
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
              ${props.onExportSession
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
              ${props.onDeleteSession
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
        })}
        
        ${!props.loading && filteredSessions.length === 0 
          ? html`<div class="muted" style="padding: 8px;">
              ${query ? "No matching sessions." : "No sessions found."}
            </div>` 
          : nothing
        }
      </div>
    </div>
  `;
}
