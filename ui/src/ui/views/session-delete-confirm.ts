import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state";

/**
 * Renders the session delete confirmation modal.
 * Shows the session being deleted and any child sessions (tasks spawned by it)
 * that will also be deleted.
 */
export function renderSessionDeleteConfirm(state: AppViewState) {
  const { sessionDeleteConfirm } = state;
  if (!sessionDeleteConfirm) {
    return nothing;
  }

  const { displayName, loading, childSessions, deleting, error } = sessionDeleteConfirm;
  const hasChildren = childSessions.length > 0;
  const totalToDelete = 1 + childSessions.length;

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-modal="true" aria-live="polite">
      <div class="exec-approval-card" style="max-width: 480px;">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">Delete Conversation</div>
            <div class="exec-approval-sub">
              ${loading
                ? "Checking for related tasks..."
                : hasChildren
                  ? `This will delete ${totalToDelete} conversation${totalToDelete > 1 ? "s" : ""}`
                  : "This will permanently delete the conversation"}
            </div>
          </div>
        </div>

        <div class="exec-approval-command mono" style="font-weight: 600;">
          ${displayName}
        </div>

        ${loading
          ? html`
              <div style="display: flex; align-items: center; gap: 8px; margin-top: 12px; color: var(--fg-dim);">
                <span class="spinner" style="width: 16px; height: 16px;"></span>
                Loading child tasks...
              </div>
            `
          : nothing}

        ${!loading && hasChildren
          ? html`
              <div class="callout warning" style="margin-top: 12px;">
                <strong>The following subtasks will also be deleted:</strong>
                <ul style="margin: 8px 0 0 0; padding-left: 20px;">
                  ${childSessions.map(
                    (child) => html`<li style="margin: 4px 0;">${child.displayName}</li>`,
                  )}
                </ul>
              </div>
            `
          : nothing}

        ${!loading && !hasChildren
          ? html`
              <div class="callout info" style="margin-top: 12px;">
                This conversation has no subtasks. Only this conversation will be deleted.
              </div>
            `
          : nothing}

        ${error
          ? html`
              <div class="callout danger" style="margin-top: 12px;">
                ${error}
              </div>
            `
          : nothing}

        <div class="exec-approval-actions">
          <button
            class="btn danger"
            ?disabled=${loading || deleting}
            @click=${() => state.handleDeleteSessionExecute()}
          >
            ${deleting
              ? html`<span class="spinner" style="width: 14px; height: 14px; margin-right: 6px;"></span>Deleting...`
              : hasChildren
                ? `Delete All (${totalToDelete})`
                : "Delete"}
          </button>
          <button
            class="btn"
            ?disabled=${deleting}
            @click=${() => state.handleDeleteSessionCancel()}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  `;
}
