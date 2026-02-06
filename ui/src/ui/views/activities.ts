import { html, nothing } from "lit";
import type { ActivityState, ActivityAction, StateValue } from "../types.js";
import { formatAgo } from "../format.js";
import { icons } from "../icons.js";
import { pathForTab } from "../navigation.js";

export type ActivitiesProps = {
  loading: boolean;
  activities: ActivityState[];
  error: string | null;
  basePath: string;
  onRefresh: () => void;
  onAction: (sessionKey: string, actionId: string, params?: Record<string, unknown>) => void;
  onOpenChat: (sessionKey: string) => void;
  // New props for expanded state management
  expandedSummaries?: Set<string>;
  onToggleSummary?: (sessionKey: string) => void;
};

// Task type to icon mapping
const TASK_TYPE_ICONS: Record<string, string> = {
  coding: "💻",
  research: "🔍",
  writing: "✍️",
  analysis: "📊",
  conversation: "💬",
  automation: "⚙️",
  unknown: "📋",
};

// Format token count (e.g., 104107 -> "104k")
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k`;
  }
  return String(tokens);
}

// Simple markdown to HTML conversion for summaries
function renderMarkdownText(text: string): string {
  if (!text) {
    return "";
  }

  let result = text
    // Escape HTML first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headers (## and ###)
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Code blocks
    .replace(/```[\w]*\n?([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    // Lists
    .replace(/^\* (.+)$/gm, "<li>$1</li>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Line breaks (but not double for paragraphs)
    .replace(/\n/g, "<br>");

  // Wrap consecutive <li> in <ul>
  result = result.replace(/(<li>.*?<\/li>)(<br>)?/g, "$1");
  result = result.replace(/(<li>.*?<\/li>)+/g, (match) => `<ul>${match}</ul>`);

  return result;
}

export function renderActivities(props: ActivitiesProps) {
  const activities = props.activities ?? [];

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Activities</div>
          <div class="card-sub">Active agent sessions and their current state.</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      <div class="activities-grid">
        ${
          activities.length === 0
            ? renderEmptyState(props.loading)
            : activities.map((activity) => renderActivityPanel(activity, props))
        }
      </div>
    </section>
  `;
}

function renderEmptyState(loading: boolean) {
  return html`
    <div class="activities-empty">
      <div class="activities-empty__icon">📭</div>
      <div class="activities-empty__title">
        ${loading ? "Loading activities..." : "No active sessions"}
      </div>
      <div class="activities-empty__description">
        ${
          loading
            ? "Please wait while we fetch your activities."
            : "Start a new agent session to see it appear here."
        }
      </div>
    </div>
  `;
}

function renderActivityPanel(activity: ActivityState, props: ActivitiesProps) {
  const updated = activity.updatedAt ? formatAgo(activity.updatedAt) : "n/a";
  const chatUrl = `${pathForTab("chat", props.basePath)}?session=${encodeURIComponent(activity.sessionKey)}`;
  const taskIcon = TASK_TYPE_ICONS[activity.taskType] || TASK_TYPE_ICONS.unknown;
  const isExpanded = props.expandedSummaries?.has(activity.sessionKey) ?? false;

  return html`
    <div class="activity-panel ${activity.isActive ? "activity-panel--active" : ""}">
      <!-- Header -->
      <div class="activity-panel__header">
        <div class="activity-panel__icon activity-panel__icon--${activity.taskType}">
          ${taskIcon}
        </div>
        <div class="activity-panel__title-group">
          <a href=${chatUrl} class="activity-panel__title">${activity.displayName}</a>
          <div class="activity-panel__subtitle">
            <span class="pill" style="padding: 2px 8px; font-size: 11px;">${activity.taskType}</span>
            <span class="activity-panel__phase">${activity.phase}</span>
          </div>
        </div>
        <div class="activity-panel__status-area">
          <div class="activity-panel__status-badge ${activity.isActive ? "activity-panel__status-badge--active" : "activity-panel__status-badge--idle"}">
            <span class="activity-panel__status-dot ${activity.isActive ? "activity-panel__status-dot--active" : ""}"></span>
            ${activity.isActive ? "active" : "idle"}
          </div>
          <span class="activity-panel__updated">${updated}</span>
        </div>
      </div>

      <!-- Visualization (if applicable) -->
      ${renderVisualization(activity)}
      
      <!-- Summary with expand/collapse -->
      ${renderSummarySection(activity, isExpanded, props)}

      <!-- Metrics chips -->
      ${renderMetricsChips(activity)}

      <!-- State values (if any) -->
      ${renderStateValues(activity.stateValues)}
      
      <!-- Actions -->
      ${renderActions(activity, props)}
    </div>
  `;
}

function renderSummarySection(
  activity: ActivityState,
  isExpanded: boolean,
  props: ActivitiesProps,
) {
  const summary = activity.summary || "";
  const needsExpand = summary.length > 200;
  const renderedHtml = renderMarkdownText(summary);

  const handleToggle = () => {
    if (props.onToggleSummary) {
      props.onToggleSummary(activity.sessionKey);
    }
  };

  return html`
    <div class="activity-panel__summary-section">
      <div 
        class="activity-panel__summary ${needsExpand && !isExpanded ? "activity-panel__summary--collapsed" : ""} ${isExpanded ? "activity-panel__summary--expanded" : ""}"
        .innerHTML=${renderedHtml}
      ></div>
      ${
        needsExpand
          ? html`
            <button class="activity-panel__toggle" @click=${handleToggle}>
              ${isExpanded ? "Show less ▲" : "Show more ▼"}
            </button>
          `
          : nothing
      }
    </div>
  `;
}

function renderMetricsChips(activity: ActivityState) {
  // Extract metrics from stateValues if present, or show defaults
  const stateValues = activity.stateValues || {};
  const chips: Array<{ icon: string; value: string; label: string }> = [];

  // Look for tokens in state values
  const tokensValue =
    stateValues["tokens"] || stateValues["totalTokens"] || stateValues["tokenCount"];
  if (tokensValue) {
    const tokenNum =
      typeof tokensValue.value === "number"
        ? tokensValue.value
        : parseInt(String(tokensValue.value), 10);
    if (!isNaN(tokenNum)) {
      chips.push({
        icon: "🎟",
        value: formatTokens(tokenNum),
        label: "tokens",
      });
    }
  }

  // Look for model in state values
  const modelValue = stateValues["model"] || stateValues["modelName"];
  if (modelValue && modelValue.value) {
    chips.push({
      icon: "⚡",
      value: String(modelValue.value),
      label: "model",
    });
  }

  // Look for status in state values
  const statusValue = stateValues["status"] || stateValues["phase"];
  if (statusValue && statusValue.value) {
    chips.push({
      icon: "📊",
      value: String(statusValue.value),
      label: "status",
    });
  }

  // If no chips found from state values, create defaults from summary parsing
  if (chips.length === 0) {
    // Try to extract tokens from summary
    const tokensMatch = activity.summary?.match(/Tokens?\s*(?:Used)?:?\s*([\d,]+)/i);
    if (tokensMatch) {
      const tokenNum = parseInt(tokensMatch[1].replace(/,/g, ""), 10);
      if (!isNaN(tokenNum)) {
        chips.push({
          icon: "🎟",
          value: formatTokens(tokenNum),
          label: "tokens",
        });
      }
    }

    // Try to extract model from summary
    const modelMatch = activity.summary?.match(/Model:?\s*([\w-]+(?:-[\w-]+)*)/i);
    if (modelMatch) {
      chips.push({
        icon: "⚡",
        value: modelMatch[1],
        label: "model",
      });
    }

    // Always show status
    chips.push({
      icon: activity.isActive ? "🟢" : "⚪",
      value: activity.isActive ? "active" : "idle",
      label: "status",
    });
  }

  if (chips.length === 0) {
    return nothing;
  }

  return html`
    <div class="activity-panel__metrics">
      ${chips.map(
        (chip) => html`
          <div class="activity-metric-chip">
            <span class="activity-metric-chip__icon">${chip.icon}</span>
            <span class="activity-metric-chip__value">${chip.value}</span>
            <span class="activity-metric-chip__label">${chip.label}</span>
          </div>
        `,
      )}
    </div>
  `;
}

function renderVisualization(activity: ActivityState) {
  switch (activity.visualization) {
    case "progress-bar":
      return renderProgressBar(activity.progress, activity.phase, activity.visualizationData);
    case "checklist":
      return renderChecklist(activity.visualizationData);
    case "timeline":
      return renderTimeline(activity.visualizationData);
    case "metrics":
      return renderMetricsVisualization(activity.visualizationData);
    default:
      // Show progress bar if progress is available even without explicit visualization type
      if (activity.progress !== null && activity.progress !== undefined) {
        return renderProgressBar(activity.progress, activity.phase, {});
      }
      return nothing;
  }
}

function renderProgressBar(progress: number | null, phase: string, _data: Record<string, unknown>) {
  if (progress === null || progress === undefined) {
    return nothing;
  }
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return html`
    <div class="activity-panel__visualization">
      <div class="activity-progress">
        <div class="activity-progress__header">
          <span class="activity-progress__phase">${phase || "Progress"}</span>
          <span class="activity-progress__value">${clampedProgress}%</span>
        </div>
        <div class="activity-progress__track">
          <div
            class="activity-progress__bar"
            style="width: ${clampedProgress}%"
          ></div>
        </div>
      </div>
    </div>
  `;
}

function renderChecklist(data: Record<string, unknown>) {
  const items = (data.items ?? []) as Array<{
    label: string;
    done: boolean;
  }>;
  if (items.length === 0) {
    return nothing;
  }

  const doneCount = items.filter((i) => i.done).length;
  const totalCount = items.length;

  return html`
    <div class="activity-panel__visualization">
      <div class="activity-checklist">
        <div class="activity-checklist__header">
          <span>Checklist</span>
          <span class="activity-checklist__count">${doneCount}/${totalCount}</span>
        </div>
        ${items.map(
          (item) => html`
            <div class="activity-checklist__item ${item.done ? "activity-checklist__item--done" : ""}">
              ${
                item.done
                  ? icons.check
                  : html`
                      <span class="activity-checklist__dot"></span>
                    `
              }
              <span>${item.label}</span>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function renderTimeline(data: Record<string, unknown>) {
  const steps = (data.steps ?? data.items ?? []) as Array<{
    label: string;
    status: "done" | "active" | "pending";
    description?: string;
  }>;

  if (steps.length === 0) {
    return nothing;
  }

  return html`
    <div class="activity-panel__visualization">
      <div class="activity-timeline">
        ${steps.map(
          (step) => html`
            <div class="activity-timeline__item activity-timeline__item--${step.status}">
              <div class="activity-timeline__marker"></div>
              <div class="activity-timeline__content">
                <div class="activity-timeline__label">${step.label}</div>
                ${
                  step.description
                    ? html`<div class="activity-timeline__status">${step.description}</div>`
                    : nothing
                }
              </div>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function renderMetricsVisualization(data: Record<string, unknown>) {
  const metrics = (data.metrics ?? []) as Array<{
    label: string;
    value: string | number;
    unit?: string;
  }>;
  if (metrics.length === 0) {
    return nothing;
  }
  return html`
    <div class="activity-panel__visualization">
      <div class="activity-metrics">
        ${metrics.map(
          (metric) => html`
            <div class="activity-metric">
              <span class="activity-metric__label">${metric.label}</span>
              <span class="activity-metric__value"
                >${metric.value}${metric.unit ?? ""}</span
              >
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function renderStateValues(stateValues: Record<string, StateValue>) {
  const values = Object.values(stateValues ?? {});
  // Filter out values we've already shown in metrics chips
  const filteredValues = values.filter(
    (sv) =>
      !["tokens", "totalTokens", "tokenCount", "model", "modelName", "status"].includes(sv.key),
  );

  if (filteredValues.length === 0) {
    return nothing;
  }

  return html`
    <div class="activity-state-values">
      ${filteredValues.map(
        (sv) => html`
          <div class="activity-state-value">
            <span class="activity-state-value__label">${sv.label}</span>
            <span class="activity-state-value__value"
              >${sv.value}${sv.unit ?? ""}</span
            >
          </div>
        `,
      )}
    </div>
  `;
}

function renderActions(activity: ActivityState, props: ActivitiesProps) {
  const actions = activity.actions ?? [];
  const chatUrl = `${pathForTab("chat", props.basePath)}?session=${encodeURIComponent(activity.sessionKey)}`;

  return html`
    <div class="activity-panel__actions">
      ${actions.map(
        (action) => html`
          <button
            class="btn btn--sm ${action.variant === "primary" ? "primary" : ""} ${action.variant === "danger" ? "danger" : ""}"
            title=${action.description}
            @click=${() => handleActionClick(activity, action, props)}
          >
            ${action.label}
          </button>
        `,
      )}
      <a href=${chatUrl} class="btn btn--sm primary">
        ${icons.messageSquare || ""} Open Chat
      </a>
    </div>
  `;
}

function handleActionClick(
  activity: ActivityState,
  action: ActivityAction,
  props: ActivitiesProps,
) {
  if (action.confirmRequired) {
    const confirmed = window.confirm(`Are you sure you want to: ${action.description}?`);
    if (!confirmed) {
      return;
    }
  }
  props.onAction(activity.sessionKey, action.id);
}
