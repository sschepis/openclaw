import { html, nothing } from "lit";
import type { CronJob } from "../../types";
import type { CanvasVisualization } from "../canvas-visualization";
import { icons } from "../../icons";

export type ContextSidebarProps = {
  /** Whether the sidebar is currently open */
  isOpen: boolean;
  /** Cron jobs for the current session */
  cronJobs: CronJob[];
  /** Visualizations created in the current session */
  visualizations: CanvasVisualization[];
  /** Currently selected visualization (for expanded view) */
  selectedVisualization: CanvasVisualization | null;
  /** Session key for filtering */
  sessionKey: string;
  /** Event handlers */
  onToggle: () => void;
  onSelectVisualization: (viz: CanvasVisualization | null) => void;
  onOpenVisualization: (viz: CanvasVisualization) => void;
  onToggleCronJob?: (job: CronJob, enabled: boolean) => void;
  onRunCronJob?: (job: CronJob) => void;
  onRemoveCronJob?: (job: CronJob) => void;
};

/**
 * Renders the collapsible right-hand context sidebar showing
 * session-specific cron jobs, visualizations, and other context.
 */
export function renderContextSidebar(props: ContextSidebarProps) {
  const { isOpen, cronJobs, visualizations, sessionKey } = props;

  // Filter to session-relevant items
  const sessionCronJobs = cronJobs.filter(
    (job) => !job.agentId || job.sessionTarget === "main" || job.sessionTarget === "isolated",
  );
  const sessionVisualizations = visualizations.filter((viz) => viz.sessionKey === sessionKey);

  const hasContent = sessionCronJobs.length > 0 || sessionVisualizations.length > 0;

  // Toggle button always visible on the edge
  const toggleButton = html`
    <button
      class="context-sidebar-toggle ${isOpen ? "context-sidebar-toggle--open" : ""}"
      @click=${props.onToggle}
      title=${isOpen ? "Close sidebar" : "Open context sidebar"}
      aria-label=${isOpen ? "Close sidebar" : "Open context sidebar"}
    >
      ${isOpen ? icons.panelRightClose : icons.panelRightOpen}
      ${
        !isOpen && hasContent
          ? html`
              <span class="context-sidebar-badge"></span>
            `
          : nothing
      }
    </button>
  `;

  if (!isOpen) {
    return toggleButton;
  }

  return html`
    ${toggleButton}
    <aside class="context-sidebar">
      <div class="context-sidebar-header">
        <h3 class="context-sidebar-title">Session Context</h3>
      </div>

      <div class="context-sidebar-content">
        ${renderVisualizationsSection(props, sessionVisualizations)}
        ${renderCronJobsSection(props, sessionCronJobs)}
        ${renderSessionInfoSection(props)}
      </div>
    </aside>
  `;
}

function renderVisualizationsSection(
  props: ContextSidebarProps,
  visualizations: CanvasVisualization[],
) {
  return html`
    <section class="context-sidebar-section">
      <div class="context-sidebar-section-header">
        <span class="context-sidebar-section-icon">${icons.canvas}</span>
        <span class="context-sidebar-section-title">Visualizations</span>
        <span class="context-sidebar-section-count">${visualizations.length}</span>
      </div>

      ${
        visualizations.length === 0
          ? html`
              <div class="context-sidebar-empty">
                <p>No visualizations yet.</p>
                <p class="context-sidebar-empty-hint">
                  AI will create interactive visualizations when explaining complex concepts.
                </p>
              </div>
            `
          : html`
            <ul class="context-sidebar-list">
              ${visualizations.map(
                (viz) => html`
                <li class="context-sidebar-item context-sidebar-viz-item">
                  <button
                    class="context-sidebar-viz-btn ${props.selectedVisualization?.id === viz.id ? "selected" : ""}"
                    @click=${() => props.onSelectVisualization(viz)}
                  >
                    <span class="context-sidebar-viz-title">${viz.title}</span>
                    <span class="context-sidebar-viz-time">
                      ${formatRelativeTime(viz.createdAt)}
                    </span>
                  </button>
                  <button
                    class="context-sidebar-action-btn"
                    @click=${() => props.onOpenVisualization(viz)}
                    title="Open in chat"
                  >
                    ${icons.maximize}
                  </button>
                </li>
              `,
              )}
            </ul>
          `
      }
    </section>
  `;
}

function renderCronJobsSection(props: ContextSidebarProps, cronJobs: CronJob[]) {
  return html`
    <section class="context-sidebar-section">
      <div class="context-sidebar-section-header">
        <span class="context-sidebar-section-icon">${icons.calendarClock}</span>
        <span class="context-sidebar-section-title">Scheduled Jobs</span>
        <span class="context-sidebar-section-count">${cronJobs.length}</span>
      </div>

      ${
        cronJobs.length === 0
          ? html`
              <div class="context-sidebar-empty">
                <p>No scheduled jobs.</p>
                <p class="context-sidebar-empty-hint">Ask AI to schedule recurring tasks or reminders.</p>
              </div>
            `
          : html`
            <ul class="context-sidebar-list">
              ${cronJobs.map(
                (job) => html`
                <li class="context-sidebar-item context-sidebar-cron-item">
                  <div class="context-sidebar-cron-main">
                    <span class="context-sidebar-cron-status ${job.enabled ? "enabled" : "disabled"}">
                      ${job.enabled ? icons.checkCircle : icons.circle}
                    </span>
                    <div class="context-sidebar-cron-info">
                      <span class="context-sidebar-cron-name">${job.name}</span>
                      <span class="context-sidebar-cron-schedule">
                        ${formatSchedule(job.schedule)}
                      </span>
                    </div>
                  </div>
                  <div class="context-sidebar-cron-actions">
                    ${
                      props.onRunCronJob
                        ? html`
                          <button
                            class="context-sidebar-action-btn"
                            @click=${() => props.onRunCronJob?.(job)}
                            title="Run now"
                          >
                            ${icons.play}
                          </button>
                        `
                        : nothing
                    }
                    ${
                      props.onToggleCronJob
                        ? html`
                          <button
                            class="context-sidebar-action-btn"
                            @click=${() => props.onToggleCronJob?.(job, !job.enabled)}
                            title=${job.enabled ? "Disable" : "Enable"}
                          >
                            ${job.enabled ? icons.pause : icons.play}
                          </button>
                        `
                        : nothing
                    }
                  </div>
                </li>
              `,
              )}
            </ul>
          `
      }
    </section>
  `;
}

function renderSessionInfoSection(props: ContextSidebarProps) {
  return html`
    <section class="context-sidebar-section context-sidebar-section--info">
      <div class="context-sidebar-section-header">
        <span class="context-sidebar-section-icon">${icons.info}</span>
        <span class="context-sidebar-section-title">Session Info</span>
      </div>
      <div class="context-sidebar-info-content">
        <div class="context-sidebar-info-row">
          <span class="context-sidebar-info-label">Session Key</span>
          <code class="context-sidebar-info-value">${truncateSessionKey(props.sessionKey)}</code>
        </div>
      </div>
    </section>
  `;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return "Just now";
}

function formatSchedule(schedule: CronJob["schedule"]): string {
  if (!schedule) {
    return "No schedule";
  }

  if (typeof schedule === "object") {
    if ("kind" in schedule) {
      if (schedule.kind === "at" && "atMs" in schedule) {
        // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- TypeScript inference needs help after narrowing
        const date = new Date(schedule.atMs as number);
        return `Once at ${date.toLocaleString()}`;
      }
      if (schedule.kind === "every" && "everyMs" in schedule) {
        // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- TypeScript inference needs help after narrowing
        const ms = schedule.everyMs as number;
        if (ms >= 86_400_000) {
          const days = Math.floor(ms / 86_400_000);
          return `Every ${days} day${days > 1 ? "s" : ""}`;
        }
        if (ms >= 3_600_000) {
          const hours = Math.floor(ms / 3_600_000);
          return `Every ${hours} hour${hours > 1 ? "s" : ""}`;
        }
        const minutes = Math.floor(ms / 60_000);
        return `Every ${minutes} min${minutes > 1 ? "s" : ""}`;
      }
      if (schedule.kind === "cron" && "expr" in schedule) {
        return `Cron: ${schedule.expr}`;
      }
    }
  }

  return "Custom schedule";
}

function truncateSessionKey(key: string): string {
  if (key.length <= 16) {
    return key;
  }
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}
