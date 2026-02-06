import { html, nothing } from "lit";
import type { ChannelUiMetaEntry, CronJob, CronRunLogEntry, CronStatus } from "../types";
import type { CronFormState } from "../ui-types";
import { formatMs, clampText } from "../format";
import {
  formatCronPayload,
  formatCronSchedule,
  formatCronState,
  formatNextRun,
} from "../presenter";

export type CronProps = {
  loading: boolean;
  status: CronStatus | null;
  jobs: CronJob[];
  error: string | null;
  busy: boolean;
  form: CronFormState;
  channels: string[];
  channelLabels?: Record<string, string>;
  channelMeta?: ChannelUiMetaEntry[];
  runsJobId: string | null;
  runs: CronRunLogEntry[];
  filter: string;
  view: "jobs" | "runs" | "add";
  expandedJob: string | null;
  onFilterChange: (next: string) => void;
  onFormChange: (patch: Partial<CronFormState>) => void;
  onRefresh: () => void;
  onAdd: () => void;
  onToggle: (job: CronJob, enabled: boolean) => void;
  onRun: (job: CronJob) => void;
  onRemove: (job: CronJob) => void;
  onLoadRuns: (jobId: string) => void;
  onViewChange: (view: "jobs" | "runs" | "add") => void;
  onJobExpand: (jobId: string | null) => void;
};

type JobGroup = {
  status: "enabled" | "disabled";
  label: string;
  jobs: CronJob[];
  count: number;
};

function groupJobsByStatus(jobs: CronJob[]): JobGroup[] {
  const enabled: CronJob[] = [];
  const disabled: CronJob[] = [];

  for (const job of jobs) {
    if (job.enabled) {
      enabled.push(job);
    } else {
      disabled.push(job);
    }
  }

  const groups: JobGroup[] = [];
  if (enabled.length > 0) {
    groups.push({ status: "enabled", label: "Enabled", jobs: enabled, count: enabled.length });
  }
  if (disabled.length > 0) {
    groups.push({ status: "disabled", label: "Disabled", jobs: disabled, count: disabled.length });
  }
  return groups;
}

function buildChannelOptions(props: CronProps): string[] {
  const options = ["last", ...props.channels.filter(Boolean)];
  const current = props.form.channel?.trim();
  if (current && !options.includes(current)) {
    options.push(current);
  }
  const seen = new Set<string>();
  return options.filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function resolveChannelLabel(props: CronProps, channel: string): string {
  if (channel === "last") {
    return "last";
  }
  const meta = props.channelMeta?.find((entry) => entry.id === channel);
  if (meta?.label) {
    return meta.label;
  }
  return props.channelLabels?.[channel] ?? channel;
}

export function renderCron(props: CronProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Cron Jobs</div>
          <div class="card-sub">Scheduled wakeups and agent runs.</div>
        </div>
        <div class="row">
          <div class="segmented-control">
            <button
              class="btn ${props.view === "jobs" ? "active" : ""}"
              @click=${() => props.onViewChange("jobs")}
            >
              Jobs
            </button>
            <button
              class="btn ${props.view === "runs" ? "active" : ""}"
              @click=${() => props.onViewChange("runs")}
            >
              Runs
            </button>
            <button
              class="btn ${props.view === "add" ? "active" : ""}"
              @click=${() => props.onViewChange("add")}
            >
              Add
            </button>
          </div>
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      ${props.view === "add" ? renderAddForm(props) : props.view === "runs" ? renderRuns(props) : renderJobs(props)}
    </section>
  `;
}

function renderJobs(props: CronProps) {
  const filter = props.filter.trim().toLowerCase();
  const filtered = filter
    ? props.jobs.filter((job) =>
        [job.name, job.description ?? "", formatCronSchedule(job)].join(" ").toLowerCase().includes(filter),
      )
    : props.jobs;

  const groups = groupJobsByStatus(filtered);

  return html`
    <div class="cron-status-bar" style="margin-top: 14px; display: flex; gap: 16px; padding: 8px 12px; background: var(--surface-alt); border-radius: 6px;">
      <div class="cron-stat">
        <span class="muted">Status:</span>
        <span>${props.status ? (props.status.enabled ? "Running" : "Stopped") : "n/a"}</span>
      </div>
      <div class="cron-stat">
        <span class="muted">Jobs:</span>
        <span>${props.status?.jobs ?? 0}</span>
      </div>
      <div class="cron-stat">
        <span class="muted">Next wake:</span>
        <span>${formatNextRun(props.status?.nextWakeAtMs ?? null)}</span>
      </div>
    </div>

    <div class="filters" style="margin-top: 14px;">
      <label class="field" style="flex: 1;">
        <span>Filter</span>
        <input
          .value=${props.filter}
          @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
          placeholder="Search jobs"
        />
      </label>
      <div class="muted">${filtered.length} shown</div>
    </div>

    ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}

    ${
      filtered.length === 0
        ? html`<div class="muted" style="margin-top: 16px">No jobs found.</div>`
        : html`
            <div class="cron-accordion" style="margin-top: 16px;">
              ${groups.map((group) => renderJobGroup(group, props))}
            </div>
          `
    }
  `;
}

function renderJobGroup(group: JobGroup, props: CronProps) {
  return html`
    <div class="skill-group skill-group--expanded">
      <div class="skill-group__header" style="pointer-events: none;">
        <span class="skill-group__title">${group.label}</span>
        <span class="skill-group__count">
          <span class="skill-group__total">${group.count}</span>
        </span>
      </div>
      <div class="skill-group__content">
        ${group.jobs.map((job) => renderJobRow(job, props))}
      </div>
    </div>
  `;
}

function renderJobRow(job: CronJob, props: CronProps) {
  const isExpanded = props.expandedJob === job.id;
  const statusClass = job.enabled ? "skill-status--ok" : "skill-status--blocked";
  const statusText = job.enabled ? "enabled" : "disabled";

  return html`
    <div class="skill-row ${isExpanded ? "skill-row--expanded" : ""}">
      <div class="skill-row__main" @click=${() => props.onJobExpand(isExpanded ? null : job.id)}>
        <span class="skill-row__emoji">⏰</span>
        <span class="skill-row__name">${job.name}</span>
        <span class="skill-row__status ${statusClass}">${statusText}</span>
        <span class="skill-row__desc">${clampText(formatCronSchedule(job), 40)}</span>
        <span class="skill-row__chevron">${isExpanded ? "▼" : "▶"}</span>
      </div>
      <div class="skill-row__actions">
        <button
          class="btn btn--sm"
          ?disabled=${props.busy}
          @click=${(event: Event) => {
            event.stopPropagation();
            props.onToggle(job, !job.enabled);
          }}
        >
          ${job.enabled ? "Disable" : "Enable"}
        </button>
        <button
          class="btn btn--sm"
          ?disabled=${props.busy}
          @click=${(event: Event) => {
            event.stopPropagation();
            props.onRun(job);
          }}
        >
          Run
        </button>
      </div>
    </div>
    ${isExpanded ? renderJobDetails(job, props) : nothing}
  `;
}

function renderJobDetails(job: CronJob, props: CronProps) {
  return html`
    <div class="skill-details">
      <div class="skill-details__desc">${job.description || "No description"}</div>

      <div class="skill-details__grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 12px;">
        <div class="skill-details__item">
          <span class="skill-details__label">Schedule</span>
          <span>${formatCronSchedule(job)}</span>
        </div>
        <div class="skill-details__item">
          <span class="skill-details__label">Session</span>
          <span>${job.sessionTarget}</span>
        </div>
        <div class="skill-details__item">
          <span class="skill-details__label">Wake mode</span>
          <span>${job.wakeMode}</span>
        </div>
        <div class="skill-details__item">
          <span class="skill-details__label">State</span>
          <span>${formatCronState(job)}</span>
        </div>
        ${job.agentId ? html`
          <div class="skill-details__item">
            <span class="skill-details__label">Agent</span>
            <span>${job.agentId}</span>
          </div>
        ` : nothing}
      </div>

      <div class="skill-details__payload" style="margin-top: 12px;">
        <span class="skill-details__label">Payload</span>
        <div class="mono" style="margin-top: 4px; font-size: 12px; padding: 8px; background: var(--surface-alt); border-radius: 4px; white-space: pre-wrap;">
          ${formatCronPayload(job)}
        </div>
      </div>

      <div class="row" style="margin-top: 12px; gap: 8px;">
        <button
          class="btn btn--sm"
          ?disabled=${props.busy}
          @click=${() => props.onLoadRuns(job.id)}
        >
          View Runs
        </button>
        <button
          class="btn btn--sm danger"
          ?disabled=${props.busy}
          @click=${() => props.onRemove(job)}
        >
          Remove
        </button>
      </div>
    </div>
  `;
}

function renderRuns(props: CronProps) {
  return html`
    <div style="margin-top: 16px;">
      <div class="muted" style="margin-bottom: 12px;">
        ${props.runsJobId ? `Showing runs for job: ${props.runsJobId}` : "Select a job to view its run history."}
      </div>

      ${
        props.runsJobId == null
          ? html`
              <div class="muted">No job selected. Go to Jobs tab and click "View Runs" on a job.</div>
            `
          : props.runs.length === 0
            ? html`<div class="muted">No runs yet for this job.</div>`
            : html`
                <div class="cron-runs-list">
                  ${props.runs.map((entry) => renderRunRow(entry))}
                </div>
              `
      }
    </div>
  `;
}

function renderRunRow(entry: CronRunLogEntry) {
  const statusClass = entry.status === "ok" ? "skill-status--ok" : entry.status === "error" ? "skill-status--blocked" : "";

  return html`
    <div class="skill-row skill-row--compact" style="margin-bottom: 4px;">
      <div class="skill-row__main">
        <span class="skill-row__status ${statusClass}">${entry.status}</span>
        <span class="skill-row__desc">${clampText(entry.summary ?? "", 60)}</span>
      </div>
      <div class="skill-row__meta">
        <span class="muted">${formatMs(entry.ts)}</span>
        <span class="chip">${entry.durationMs ?? 0}ms</span>
      </div>
    </div>
    ${entry.error ? html`<div class="muted" style="margin-left: 24px; font-size: 12px; color: var(--danger-color);">${entry.error}</div>` : nothing}
  `;
}

function renderAddForm(props: CronProps) {
  const channelOptions = buildChannelOptions(props);

  return html`
    <div class="cron-add-form" style="margin-top: 16px;">
      <div class="form-grid">
        <label class="field">
          <span>Name</span>
          <input
            .value=${props.form.name}
            @input=${(e: Event) => props.onFormChange({ name: (e.target as HTMLInputElement).value })}
            placeholder="Job name"
          />
        </label>
        <label class="field">
          <span>Description</span>
          <input
            .value=${props.form.description}
            @input=${(e: Event) => props.onFormChange({ description: (e.target as HTMLInputElement).value })}
            placeholder="Optional description"
          />
        </label>
        <label class="field">
          <span>Agent ID</span>
          <input
            .value=${props.form.agentId}
            @input=${(e: Event) => props.onFormChange({ agentId: (e.target as HTMLInputElement).value })}
            placeholder="default"
          />
        </label>
        <label class="field checkbox">
          <span>Enabled</span>
          <input
            type="checkbox"
            .checked=${props.form.enabled}
            @change=${(e: Event) => props.onFormChange({ enabled: (e.target as HTMLInputElement).checked })}
          />
        </label>
      </div>

      <div class="form-grid" style="margin-top: 12px;">
        <label class="field">
          <span>Schedule type</span>
          <select
            .value=${props.form.scheduleKind}
            @change=${(e: Event) => props.onFormChange({ scheduleKind: (e.target as HTMLSelectElement).value as CronFormState["scheduleKind"] })}
          >
            <option value="every">Every</option>
            <option value="at">At</option>
            <option value="cron">Cron</option>
          </select>
        </label>
      </div>

      ${renderScheduleFields(props)}

      <div class="form-grid" style="margin-top: 12px;">
        <label class="field">
          <span>Session</span>
          <select
            .value=${props.form.sessionTarget}
            @change=${(e: Event) => props.onFormChange({ sessionTarget: (e.target as HTMLSelectElement).value as CronFormState["sessionTarget"] })}
          >
            <option value="main">Main</option>
            <option value="isolated">Isolated</option>
          </select>
        </label>
        <label class="field">
          <span>Wake mode</span>
          <select
            .value=${props.form.wakeMode}
            @change=${(e: Event) => props.onFormChange({ wakeMode: (e.target as HTMLSelectElement).value as CronFormState["wakeMode"] })}
          >
            <option value="next-heartbeat">Next heartbeat</option>
            <option value="now">Now</option>
          </select>
        </label>
        <label class="field">
          <span>Payload type</span>
          <select
            .value=${props.form.payloadKind}
            @change=${(e: Event) => props.onFormChange({ payloadKind: (e.target as HTMLSelectElement).value as CronFormState["payloadKind"] })}
          >
            <option value="systemEvent">System event</option>
            <option value="agentTurn">Agent turn</option>
          </select>
        </label>
      </div>

      <label class="field" style="margin-top: 12px;">
        <span>${props.form.payloadKind === "systemEvent" ? "System text" : "Agent message"}</span>
        <textarea
          .value=${props.form.payloadText}
          @input=${(e: Event) => props.onFormChange({ payloadText: (e.target as HTMLTextAreaElement).value })}
          rows="3"
          placeholder="Enter payload text..."
        ></textarea>
      </label>

      ${
        props.form.payloadKind === "agentTurn"
          ? html`
              <div class="form-grid" style="margin-top: 12px;">
                <label class="field checkbox">
                  <span>Deliver</span>
                  <input
                    type="checkbox"
                    .checked=${props.form.deliver}
                    @change=${(e: Event) => props.onFormChange({ deliver: (e.target as HTMLInputElement).checked })}
                  />
                </label>
                <label class="field">
                  <span>Channel</span>
                  <select
                    .value=${props.form.channel || "last"}
                    @change=${(e: Event) => props.onFormChange({ channel: (e.target as HTMLSelectElement).value })}
                  >
                    ${channelOptions.map((channel) => html`<option value=${channel}>${resolveChannelLabel(props, channel)}</option>`)}
                  </select>
                </label>
                <label class="field">
                  <span>To</span>
                  <input
                    .value=${props.form.to}
                    @input=${(e: Event) => props.onFormChange({ to: (e.target as HTMLInputElement).value })}
                    placeholder="+1555… or chat id"
                  />
                </label>
                <label class="field">
                  <span>Timeout (s)</span>
                  <input
                    .value=${props.form.timeoutSeconds}
                    @input=${(e: Event) => props.onFormChange({ timeoutSeconds: (e.target as HTMLInputElement).value })}
                  />
                </label>
                ${
                  props.form.sessionTarget === "isolated"
                    ? html`
                        <label class="field">
                          <span>Post prefix</span>
                          <input
                            .value=${props.form.postToMainPrefix}
                            @input=${(e: Event) => props.onFormChange({ postToMainPrefix: (e.target as HTMLInputElement).value })}
                          />
                        </label>
                      `
                    : nothing
                }
              </div>
            `
          : nothing
      }

      <div class="row" style="margin-top: 16px;">
        <button class="btn primary" ?disabled=${props.busy} @click=${props.onAdd}>
          ${props.busy ? "Saving…" : "Add Job"}
        </button>
      </div>
    </div>
  `;
}

function renderScheduleFields(props: CronProps) {
  const form = props.form;
  if (form.scheduleKind === "at") {
    return html`
      <label class="field" style="margin-top: 12px;">
        <span>Run at</span>
        <input
          type="datetime-local"
          .value=${form.scheduleAt}
          @input=${(e: Event) => props.onFormChange({ scheduleAt: (e.target as HTMLInputElement).value })}
        />
      </label>
    `;
  }
  if (form.scheduleKind === "every") {
    return html`
      <div class="form-grid" style="margin-top: 12px;">
        <label class="field">
          <span>Every</span>
          <input
            .value=${form.everyAmount}
            @input=${(e: Event) => props.onFormChange({ everyAmount: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label class="field">
          <span>Unit</span>
          <select
            .value=${form.everyUnit}
            @change=${(e: Event) => props.onFormChange({ everyUnit: (e.target as HTMLSelectElement).value as CronFormState["everyUnit"] })}
          >
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </label>
      </div>
    `;
  }
  return html`
    <div class="form-grid" style="margin-top: 12px;">
      <label class="field">
        <span>Expression</span>
        <input
          .value=${form.cronExpr}
          @input=${(e: Event) => props.onFormChange({ cronExpr: (e.target as HTMLInputElement).value })}
          placeholder="0 7 * * *"
        />
      </label>
      <label class="field">
        <span>Timezone</span>
        <input
          .value=${form.cronTz}
          @input=${(e: Event) => props.onFormChange({ cronTz: (e.target as HTMLInputElement).value })}
          placeholder="America/Los_Angeles"
        />
      </label>
    </div>
  `;
}
