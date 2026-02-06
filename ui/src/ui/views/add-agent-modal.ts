import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state";
import { icons } from "../icons";

export function renderAddAgentModal(state: AppViewState) {
  if (!state.addAgentModalOpen) {
    return nothing;
  }

  const models = Array.isArray(state.debugModels) ? state.debugModels : [];
  const { handle, model } = state.addAgentForm;

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-live="polite">
      <div class="exec-approval-card" style="width: 500px;">
        <div class="exec-approval-header">
          <div class="exec-approval-title">Add Agent to Conversation</div>
          <button
            class="btn--icon"
            @click=${state.handleCloseAddAgentModal}
            aria-label="Close"
          >
            ${icons.x}
          </button>
        </div>
        
        <div style="margin-top: 16px; display: grid; gap: 12px;">
          <label class="field">
            <span>Agent Handle</span>
            <input
              type="text"
              placeholder="e.g. research, coder"
              .value=${handle}
              @input=${(e: Event) => {
                const value = (e.target as HTMLInputElement).value;
                state.handleAddAgentFormUpdate({ handle: value });
              }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter" && handle) {
                  void state.handleAddAgent(handle, model);
                }
              }}
              autofocus
            />
            <div class="field-help">The name used to mention this agent (@name)</div>
          </label>

          <label class="field">
            <span>Model Provider</span>
            <select
              .value=${model}
              @change=${(e: Event) => {
                const value = (e.target as HTMLSelectElement).value;
                state.handleAddAgentFormUpdate({ model: value });
              }}
            >
              <option value="">Default Model</option>
              ${(models as Array<{ id: string; provider: string }>).map(
                (m) => html`
                <option value=${m.id}>${m.id} (${m.provider})</option>
              `,
              )}
            </select>
            <div class="field-help">Select the AI model for this agent</div>
          </label>
        </div>

        <div class="exec-approval-actions" style="justify-content: flex-end; margin-top: 24px;">
          <button 
            class="btn" 
            @click=${state.handleCloseAddAgentModal}
          >
            Cancel
          </button>
          <button 
            class="btn primary" 
            ?disabled=${!handle}
            @click=${() => state.handleAddAgent(handle, model)}
          >
            Add Agent
          </button>
        </div>
      </div>
    </div>
  `;
}
