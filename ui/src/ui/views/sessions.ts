import { html, nothing } from "lit";
import type { GatewaySessionRow, SessionsListResult, CronJob } from "../types";
import { formatAgo } from "../format";
import { pathForTab } from "../navigation";
import { formatSessionTokens } from "../presenter";

export type SessionsProps = {
  loading: boolean;
  result: SessionsListResult | null;
  error: string | null;
  activeMinutes: string;
  limit: string;
  includeGlobal: boolean;
  includeUnknown: boolean;
  basePath: string;
  onFiltersChange: (next: {
    activeMinutes: string;
    limit: string;
    includeGlobal: boolean;
    includeUnknown: boolean;
  }) => void;
  onRefresh: () => void;
  onPatch: (
    key: string,
    patch: {
      label?: string | null;
      thinkingLevel?: string | null;
      verboseLevel?: string | null;
      reasoningLevel?: string | null;
    },
  ) => void;
  onDelete: (key: string) => void;
};

const THINK_LEVELS = ["", "off", "minimal", "low", "medium", "high"] as const;
const BINARY_THINK_LEVELS = ["", "off", "on"] as const;
const VERBOSE_LEVELS = [
  { value: "", label: "inherit" },
  { value: "off", label: "off (explicit)" },
  { value: "on", label: "on" },
] as const;
const REASONING_LEVELS = ["", "off", "on", "stream"] as const;

function normalizeProviderId(provider?: string | null): string {
  if (!provider) {
    return "";
  }
  const normalized = provider.trim().toLowerCase();
  if (normalized === "z.ai" || normalized === "z-ai") {
    return "zai";
  }
  return normalized;
}

function isBinaryThinkingProvider(provider?: string | null): boolean {
  return normalizeProviderId(provider) === "zai";
}

function resolveThinkLevelOptions(provider?: string | null): readonly string[] {
  return isBinaryThinkingProvider(provider) ? BINARY_THINK_LEVELS : THINK_LEVELS;
}

function resolveThinkLevelDisplay(value: string, isBinary: boolean): string {
  if (!isBinary) {
    return value;
  }
  if (!value || value === "off") {
    return value;
  }
  return "on";
}

function resolveThinkLevelPatchValue(value: string, isBinary: boolean): string | null {
  if (!value) {
    return null;
  }
  if (!isBinary) {
    return value;
  }
  if (value === "on") {
    return "low";
  }
  return value;
}

export function renderSessions(props: SessionsProps) {
  const rows = props.result?.sessions ?? [];
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Sessions</div>
          <div class="card-sub">Active session keys and per-session overrides.</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div class="filters" style="margin-top: 14px;">
        <label class="field">
          <span>Active within (minutes)</span>
          <input
            .value=${props.activeMinutes}
            @input=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: (e.target as HTMLInputElement).value,
                limit: props.limit,
                includeGlobal: props.includeGlobal,
                includeUnknown: props.includeUnknown,
              })}
          />
        </label>
        <label class="field">
          <span>Limit</span>
          <input
            .value=${props.limit}
            @input=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: props.activeMinutes,
                limit: (e.target as HTMLInputElement).value,
                includeGlobal: props.includeGlobal,
                includeUnknown: props.includeUnknown,
              })}
          />
        </label>
        <label class="field checkbox">
          <span>Include global</span>
          <input
            type="checkbox"
            .checked=${props.includeGlobal}
            @change=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: props.activeMinutes,
                limit: props.limit,
                includeGlobal: (e.target as HTMLInputElement).checked,
                includeUnknown: props.includeUnknown,
              })}
          />
        </label>
        <label class="field checkbox">
          <span>Include unknown</span>
          <input
            type="checkbox"
            .checked=${props.includeUnknown}
            @change=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: props.activeMinutes,
                limit: props.limit,
                includeGlobal: props.includeGlobal,
                includeUnknown: (e.target as HTMLInputElement).checked,
              })}
          />
        </label>
      </div>

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      <div class="muted" style="margin-top: 12px;">
        ${props.result ? `Store: ${props.result.path}` : ""}
      </div>

      <div class="session-grid">
        ${
          rows.length === 0
            ? html`
                <div class="muted">No sessions found.</div>
              `
            : rows.map((row) =>
                renderSessionCard(
                  row,
                  props.basePath,
                  props.onPatch,
                  props.onDelete,
                  props.loading,
                ),
              )
        }
      </div>
    </section>
  `;
}

function renderCronBadge(job: CronJob) {
  const schedule = job.schedule;
  let label = "Unknown";
  if (schedule.kind === "every") {
    const mins = Math.round(schedule.everyMs / 60000);
    label = mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`;
  } else if (schedule.kind === "cron") {
    label = schedule.expr;
  } else if (schedule.kind === "at") {
    label = new Date(schedule.atMs).toLocaleString();
  }

  const _state = job.enabled ? "active" : "disabled";
  const icon = job.enabled ? "⚡" : "⏸️";

  return html`<div class="session-cron-item" title="${job.name || "Cron Job"}">
    <span class="session-cron-badge">${icon} ${label}</span>
    <span style="opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${job.name || "Untitled"}</span>
  </div>`;
}

function renderSessionCard(
  row: GatewaySessionRow,
  basePath: string,
  onPatch: SessionsProps["onPatch"],
  onDelete: SessionsProps["onDelete"],
  disabled: boolean,
) {
  const updated = row.updatedAt ? formatAgo(row.updatedAt) : "n/a";
  const rawThinking = row.thinkingLevel ?? "";
  const isBinaryThinking = isBinaryThinkingProvider(row.modelProvider);
  const thinking = resolveThinkLevelDisplay(rawThinking, isBinaryThinking);
  const thinkLevels = resolveThinkLevelOptions(row.modelProvider);
  const verbose = row.verboseLevel ?? "";
  const reasoning = row.reasoningLevel ?? "";
  const displayName = row.displayName ?? row.key;
  const canLink = row.kind !== "global";
  const chatUrl = canLink
    ? `${pathForTab("chat", basePath)}?session=${encodeURIComponent(row.key)}`
    : null;

  return html`
    <div class="session-card">
      <div class="session-card-header">
        <div>
          <div>
            ${
              canLink
                ? html`<a href=${chatUrl} class="session-card-title">${displayName}</a>`
                : html`<span class="session-card-title">${displayName}</span>`
            }
          </div>
          <div class="session-card-subtitle">${row.kind} • Updated ${updated}</div>
        </div>
        ${row.modelProvider ? html`<span class="pill">${row.modelProvider}</span>` : nothing}
      </div>

      <div class="session-card-body">
        <div class="field">
           <input
            .value=${row.label ?? ""}
            ?disabled=${disabled}
            placeholder="Label (optional)"
            @change=${(e: Event) => {
              const value = (e.target as HTMLInputElement).value.trim();
              onPatch(row.key, { label: value || null });
            }}
          />
        </div>

        <div class="session-stat-row">
          <span class="session-stat-label">Tokens</span>
          <span class="session-stat-value">${formatSessionTokens(row)}</span>
        </div>

        <div class="session-stat-row" style="align-items: center">
          <span class="session-stat-label">Thinking</span>
           <select
            style="padding: 2px 6px; font-size: 12px; height: auto;"
            .value=${thinking}
            ?disabled=${disabled}
            @change=${(e: Event) => {
              const value = (e.target as HTMLSelectElement).value;
              onPatch(row.key, {
                thinkingLevel: resolveThinkLevelPatchValue(value, isBinaryThinking),
              });
            }}
          >
            ${thinkLevels.map((level) => html`<option value=${level}>${level || "inherit"}</option>`)}
          </select>
        </div>

        <div class="session-stat-row" style="align-items: center">
           <span class="session-stat-label">Verbose</span>
           <select
            style="padding: 2px 6px; font-size: 12px; height: auto;"
            .value=${verbose}
            ?disabled=${disabled}
            @change=${(e: Event) => {
              const value = (e.target as HTMLSelectElement).value;
              onPatch(row.key, { verboseLevel: value || null });
            }}
          >
            ${VERBOSE_LEVELS.map(
              (level) => html`<option value=${level.value}>${level.label}</option>`,
            )}
          </select>
        </div>

         <div class="session-stat-row" style="align-items: center">
           <span class="session-stat-label">Reasoning</span>
           <select
            style="padding: 2px 6px; font-size: 12px; height: auto;"
            .value=${reasoning}
            ?disabled=${disabled}
            @change=${(e: Event) => {
              const value = (e.target as HTMLSelectElement).value;
              onPatch(row.key, { reasoningLevel: value || null });
            }}
          >
            ${REASONING_LEVELS.map(
              (level) => html`<option value=${level}>${level || "inherit"}</option>`,
            )}
          </select>
        </div>

        ${
          row.cronJobs && row.cronJobs.length > 0
            ? html`
          <div class="session-cron-list">
            <div class="session-cron-title">Active Tasks</div>
            ${row.cronJobs.map((job) => renderCronBadge(job))}
          </div>
        `
            : nothing
        }
      </div>

      <div class="session-card-actions">
        <button class="btn danger btn--sm" ?disabled=${disabled} @click=${() => onDelete(row.key)}>
          Delete
        </button>
        ${
          canLink
            ? html`
          <a href=${chatUrl} class="btn primary btn--sm">
             Open Chat
          </a>
        `
            : nothing
        }
      </div>
    </div>
  `;
}
