import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state";
import { icons } from "../icons";
import { formatCronSchedule, formatNextRun } from "../presenter";

export function renderChatSettings(state: AppViewState) {
  if (!state.settingsOpen) {
    return nothing;
  }

  const activeSession = state.sessionsResult?.sessions?.find(
    (s) => s.key === state.sessionKey,
  );

  if (!activeSession) {
    return nothing;
  }

  const models = Array.isArray(state.debugModels) ? state.debugModels : [];
  const currentModel = activeSession.model ?? "";

  const isMainSession = activeSession.key === state.agentsList?.mainKey;
  const relevantJobs = state.cronJobs.filter((job) => {
    if (isMainSession && job.sessionTarget === "main") return true;
    return false;
  });

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-live="polite">
      <div class="exec-approval-card" style="width: 500px;">
        <div class="exec-approval-header">
          <div class="exec-approval-title">Session Settings</div>
          <button
            class="btn--icon"
            @click=${state.handleToggleSettings}
            aria-label="Close settings"
          >
            ${icons.x}
          </button>
        </div>
        
        <div style="margin-top: 16px; display: grid; gap: 12px;">
          <label class="field">
            <span>Model</span>
            <select
              .value=${currentModel}
              @change=${(e: Event) => {
                const value = (e.target as HTMLSelectElement).value;
                state.handleSessionsPatch(activeSession.key, { model: value || null });
              }}
            >
              <option value="">Default</option>
              ${models.map(
                (m: any) => html`
                <option value=${m.id}>${m.id} (${m.provider})</option>
              `,
              )}
            </select>
          </label>

          <label class="field">
            <span>Thinking Level</span>
            <select
              .value=${activeSession.thinkingLevel ?? ""}
              @change=${(e: Event) => {
                const value = (e.target as HTMLSelectElement).value;
                state.handleSessionsPatch(activeSession.key, { thinkingLevel: value || null });
              }}
            >
              <option value="">Default</option>
              <option value="off">Off</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        <div class="divider" style="margin: 16px 0; border-top: 1px solid var(--border);"></div>

        <div class="card-title" style="font-size: 14px; font-weight: 600;">Scheduled Jobs</div>
        ${
          relevantJobs.length === 0
            ? html`<div class="muted" style="margin-top: 8px;">No jobs targeting this session.</div>`
            : html`
            <div class="list" style="margin-top: 8px;">
              ${relevantJobs.map(
                (job) => html`
                <div class="list-item" style="padding: 8px;">
                  <div class="list-main">
                    <div class="list-title" style="font-size: 13px;">${job.name}</div>
                    <div class="list-sub" style="font-size: 12px;">${formatCronSchedule(job)}</div>
                  </div>
                  <div class="list-meta" style="font-size: 12px;">
                    <div>${formatNextRun(job.state?.nextRunAtMs)}</div>
                  </div>
                </div>
              `,
              )}
            </div>
          `
        }

        <div class="exec-approval-actions" style="justify-content: flex-end; margin-top: 16px;">
          <button class="btn" @click=${state.handleToggleSettings}>Done</button>
        </div>
      </div>
    </div>
  `;
}
