import { html, nothing } from "lit";
import { icons } from "../icons";

export type ThinkingAction = {
  id: string;
  kind: "tool" | "lifecycle" | "assistant";
  status: "running" | "done" | "error";
  label: string;
  detail?: string;
  timestamp: number;
};

export type ThinkingState = {
  active: boolean;
  status: string;
  actions: ThinkingAction[];
};

export function renderThinkingPanel(state: ThinkingState) {
  if (!state.active && state.actions.length === 0) {
    return nothing;
  }

  const activeAction = state.actions.find((a) => a.status === "running");
  const displayStatus = activeAction ? activeAction.label : state.status || "Thinking...";

  return html`
    <div class="thinking-panel">
      <div class="thinking-header">
        <div class="thinking-loader">
          ${
            state.active
              ? html`
                  <div class="thinking-spinner"></div>
                `
              : icons.check
          }
        </div>
        <div class="thinking-status">${displayStatus}</div>
      </div>
      
      ${
        state.actions.length > 0
          ? html`
        <div class="thinking-actions">
          ${state.actions.map((action) => renderAction(action))}
        </div>
      `
          : nothing
      }
    </div>
  `;
}

function renderAction(action: ThinkingAction) {
  const icon =
    action.status === "running"
      ? html`
          <div class="thinking-dot-pulse"></div>
        `
      : action.status === "error"
        ? icons.alert
        : icons.check;

  const classes = `thinking-action ${action.status}`;

  return html`
    <div class="${classes}">
      <div class="thinking-action-icon">${icon}</div>
      <div class="thinking-action-content">
        <div class="thinking-action-label">${action.label}</div>
        ${action.detail ? html`<div class="thinking-action-detail">${action.detail}</div>` : nothing}
      </div>
      <div class="thinking-action-time">${formatTime(action.timestamp)}</div>
    </div>
  `;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
