import { html, nothing } from "lit";
import type { ActivityState, ActivityAction, StateValue } from "../types.js";
import { formatAgo } from "../format.js";
import { pathForTab } from "../navigation.js";
import { icons } from "../icons.js";

export type ActivitiesProps = {
  loading: boolean;
  activities: ActivityState[];
  error: string | null;
  basePath: string;
  onRefresh: () => void;
  onAction: (
    sessionKey: string,
    actionId: string,
    params?: Record<string, unknown>,
  ) => void;
  onOpenChat: (sessionKey: string) => void;
};

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

      ${props.error
        ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
        : nothing}

      <div class="activities-grid">
        ${activities.length === 0
          ? html`<div class="muted" style="padding: 20px;">
              ${props.loading ? "Loading activities..." : "No active sessions."}
            </div>`
          : activities.map((activity) =>
              renderActivityPanel(activity, props),
            )}
      </div>
    </section>
  `;
}

function renderActivityPanel(activity: ActivityState, props: ActivitiesProps) {
  const updated = activity.updatedAt ? formatAgo(activity.updatedAt) : "n/a";
  const chatUrl = `${pathForTab("chat", props.basePath)}?session=${encodeURIComponent(activity.sessionKey)}`;

  return html`
    <div class="activity-panel ${activity.isActive ? "activity-panel--active" : ""}">
      <div class="activity-panel__header">
        <div>
          <a href=${chatUrl} class="activity-panel__title">${activity.displayName}</a>
          <div class="activity-panel__meta">
            <span class="pill">${activity.taskType}</span>
            <span class="muted">Updated ${updated}</span>
          </div>
        </div>
        ${activity.isActive
          ? html`<span class="activity-panel__status-dot activity-panel__status-dot--active" title="Active"></span>`
          : html`<span class="activity-panel__status-dot" title="Idle"></span>`}
      </div>

      <div class="activity-panel__phase">${activity.phase}</div>
      <div class="activity-panel__summary">${activity.summary}</div>

      ${renderVisualization(activity)}
      ${renderStateValues(activity.stateValues)}
      ${renderActions(activity, props)}
    </div>
  `;
}

function renderVisualization(activity: ActivityState) {
  switch (activity.visualization) {
    case "progress-bar":
      return renderProgressBar(activity.progress, activity.visualizationData);
    case "checklist":
      return renderChecklist(activity.visualizationData);
    case "metrics":
      return renderMetrics(activity.visualizationData);
    default:
      return nothing;
  }
}

function renderProgressBar(
  progress: number | null,
  _data: Record<string, unknown>,
) {
  if (progress === null) {
    return nothing;
  }
  const clampedProgress = Math.max(0, Math.min(100, progress));
  return html`
    <div class="activity-progress">
      <div
        class="activity-progress__bar"
        style="width: ${clampedProgress}%"
      ></div>
      <span class="activity-progress__label">${clampedProgress}%</span>
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
  return html`
    <div class="activity-checklist">
      ${items.map(
        (item) => html`
          <div class="activity-checklist__item ${item.done ? "activity-checklist__item--done" : ""}">
            ${item.done ? icons.check : html`<span class="activity-checklist__dot"></span>`}
            <span>${item.label}</span>
          </div>
        `,
      )}
    </div>
  `;
}

function renderMetrics(data: Record<string, unknown>) {
  const metrics = (data.metrics ?? []) as Array<{
    label: string;
    value: string | number;
    unit?: string;
  }>;
  if (metrics.length === 0) {
    return nothing;
  }
  return html`
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
  `;
}

function renderStateValues(stateValues: Record<string, StateValue>) {
  const values = Object.values(stateValues ?? {});
  if (values.length === 0) {
    return nothing;
  }

  return html`
    <div class="activity-state-values">
      ${values.map(
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
    <div class="activity-actions">
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
      <a href=${chatUrl} class="btn btn--sm"> Open Chat </a>
    </div>
  `;
}

function handleActionClick(
  activity: ActivityState,
  action: ActivityAction,
  props: ActivitiesProps,
) {
  if (action.confirmRequired) {
    const confirmed = window.confirm(
      `Are you sure you want to: ${action.description}?`,
    );
    if (!confirmed) {
      return;
    }
  }
  props.onAction(activity.sessionKey, action.id);
}
