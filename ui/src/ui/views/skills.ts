import { html, nothing } from "lit";
import type { SkillMessageMap, RegistrySkill } from "../controllers/skills";
import type { SkillStatusEntry, SkillStatusReport } from "../types";
import { clampText } from "../format";

export type SkillsProps = {
  loading: boolean;
  report: SkillStatusReport | null;
  error: string | null;
  filter: string;
  edits: Record<string, string>;
  busyKey: string | null;
  messages: SkillMessageMap;
  view: "installed" | "registry";
  registryLoading?: boolean;
  registryError?: string | null;
  registryList?: RegistrySkill[];
  expandedGroups: Set<string>;
  expandedSkill: string | null;
  onFilterChange: (next: string) => void;
  onRefresh: () => void;
  onToggle: (skillKey: string, enabled: boolean) => void;
  onEdit: (skillKey: string, value: string) => void;
  onSaveKey: (skillKey: string) => void;
  onInstall: (skillKey: string, name: string, installId: string) => void;
  onViewChange: (view: "installed" | "registry") => void;
  onGroupToggle: (group: string) => void;
  onSkillExpand: (skillKey: string | null) => void;
};

// Group skills by source for accordion display
type SkillGroup = {
  source: string;
  label: string;
  skills: SkillStatusEntry[];
  enabledCount: number;
  totalCount: number;
};

const SOURCE_LABELS: Record<string, string> = {
  "openclaw-bundled": "Bundled Skills",
  managed: "Managed Skills",
  workspace: "Workspace Skills",
  custom: "Custom Skills",
};

const SOURCE_ORDER = ["openclaw-bundled", "managed", "workspace", "custom"];

function groupSkillsBySource(skills: SkillStatusEntry[]): SkillGroup[] {
  const groups = new Map<string, SkillStatusEntry[]>();

  for (const skill of skills) {
    const source = skill.source || "custom";
    if (!groups.has(source)) {
      groups.set(source, []);
    }
    groups.get(source)!.push(skill);
  }

  // Sort by predefined order, then alphabetically for unknown sources
  const sortedSources = Array.from(groups.keys()).toSorted((a, b) => {
    const aIdx = SOURCE_ORDER.indexOf(a);
    const bIdx = SOURCE_ORDER.indexOf(b);
    if (aIdx >= 0 && bIdx >= 0) {
      return aIdx - bIdx;
    }
    if (aIdx >= 0) {
      return -1;
    }
    if (bIdx >= 0) {
      return 1;
    }
    return a.localeCompare(b);
  });

  return sortedSources.map((source) => {
    const skillList = groups.get(source)!;
    return {
      source,
      label: SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1),
      skills: skillList,
      enabledCount: skillList.filter((s) => !s.disabled && s.eligible).length,
      totalCount: skillList.length,
    };
  });
}

export function renderSkills(props: SkillsProps) {
  const skills = props.report?.skills ?? [];
  const filter = props.filter.trim().toLowerCase();

  const filtered = filter
    ? skills.filter((skill) =>
        [skill.name, skill.description, skill.source].join(" ").toLowerCase().includes(filter),
      )
    : skills;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Skills</div>
          <div class="card-sub">Bundled, managed, and workspace skills.</div>
        </div>
        <div class="row">
          <div class="segmented-control">
            <button
              class="btn ${props.view === "installed" ? "active" : ""}"
              @click=${() => props.onViewChange("installed")}
            >
              Installed
            </button>
            <button
              class="btn ${props.view === "registry" ? "active" : ""}"
              @click=${() => props.onViewChange("registry")}
            >
              Registry
            </button>
          </div>
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      ${props.view === "registry" ? renderRegistry(props) : renderInstalled(props, filtered)}
    </section>
  `;
}

function renderRegistry(props: SkillsProps) {
  if (props.registryLoading) {
    return html`
      <div class="muted" style="margin-top: 16px">Loading registry...</div>
    `;
  }
  if (props.registryError) {
    return html`<div class="callout danger" style="margin-top: 16px">${props.registryError}</div>`;
  }

  const list = props.registryList ?? [];
  if (list.length === 0) {
    return html`
      <div class="muted" style="margin-top: 16px">No skills in registry.</div>
    `;
  }

  return html`
    <div class="skills-registry" style="margin-top: 16px;">
      ${list.map(
        (skill) => html`
          <div class="skill-row skill-row--compact">
            <div class="skill-row__main">
              <span class="skill-row__name">${skill.name}</span>
              <span class="skill-row__desc">${clampText(skill.description, 80)}</span>
            </div>
            <div class="skill-row__meta">
              <span class="chip">${skill.author}</span>
            </div>
            <div class="skill-row__actions">
              <button class="btn btn--sm primary" @click=${() => alert("Install logic would go here")}>
                Install
              </button>
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

function renderInstalled(props: SkillsProps, filtered: SkillStatusEntry[]) {
  const groups = groupSkillsBySource(filtered);

  return html`
    <div class="filters" style="margin-top: 14px;">
      <label class="field" style="flex: 1;">
        <span>Filter</span>
        <input
          .value=${props.filter}
          @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
          placeholder="Search skills"
        />
      </label>
      <div class="muted">${filtered.length} shown</div>
    </div>

    ${
      props.error
        ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
        : nothing
    }
    ${
      filtered.length === 0
        ? html`
            <div class="muted" style="margin-top: 16px">No skills found.</div>
          `
        : html`
          <div class="skills-accordion" style="margin-top: 16px;">
            ${groups.map((group) => renderSkillGroup(group, props))}
          </div>
        `
    }
  `;
}

function renderSkillGroup(group: SkillGroup, props: SkillsProps) {
  const isExpanded = props.expandedGroups.has(group.source);

  return html`
    <div class="skill-group ${isExpanded ? "skill-group--expanded" : ""}">
      <button class="skill-group__header" @click=${() => props.onGroupToggle(group.source)}>
        <span class="skill-group__chevron">${isExpanded ? "▼" : "▶"}</span>
        <span class="skill-group__title">${group.label}</span>
        <span class="skill-group__count">
          <span class="skill-group__enabled">${group.enabledCount}</span>
          <span class="skill-group__sep">/</span>
          <span class="skill-group__total">${group.totalCount}</span>
        </span>
      </button>
      ${
        isExpanded
          ? html`
            <div class="skill-group__content">
              ${group.skills.map((skill) => renderSkillRow(skill, props))}
            </div>
          `
          : nothing
      }
    </div>
  `;
}

function renderSkillRow(skill: SkillStatusEntry, props: SkillsProps) {
  const busy = props.busyKey === skill.skillKey;
  const isExpanded = props.expandedSkill === skill.skillKey;
  const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;

  // Status indicators
  const statusClass = skill.eligible ? "skill-status--ok" : "skill-status--blocked";
  const statusText = skill.eligible ? "eligible" : "blocked";

  return html`
    <div class="skill-row ${isExpanded ? "skill-row--expanded" : ""}">
      <div class="skill-row__main" @click=${() => props.onSkillExpand(isExpanded ? null : skill.skillKey)}>
        <span class="skill-row__emoji">${skill.emoji || "⚡"}</span>
        <span class="skill-row__name">${skill.name}</span>
        <span class="skill-row__status ${statusClass}">${statusText}</span>
        ${
          skill.disabled
            ? html`
                <span class="skill-row__disabled">disabled</span>
              `
            : nothing
        }
        <span class="skill-row__chevron">${isExpanded ? "▼" : "▶"}</span>
      </div>
      <div class="skill-row__actions">
        <button class="btn btn--sm" ?disabled=${busy} @click=${() => props.onToggle(skill.skillKey, skill.disabled)}>
          ${skill.disabled ? "Enable" : "Disable"}
        </button>
        ${
          canInstall
            ? html`<button
              class="btn btn--sm"
              ?disabled=${busy}
              @click=${() => props.onInstall(skill.skillKey, skill.name, skill.install[0].id)}
            >
              ${busy ? "…" : skill.install[0].label}
            </button>`
            : nothing
        }
      </div>
    </div>
    ${isExpanded ? renderSkillDetails(skill, props) : nothing}
  `;
}

function renderSkillDetails(skill: SkillStatusEntry, props: SkillsProps) {
  const apiKey = props.edits[skill.skillKey] ?? "";
  const message = props.messages[skill.skillKey] ?? null;
  const busy = props.busyKey === skill.skillKey;
  const missing = [
    ...skill.missing.bins.map((b) => `bin:${b}`),
    ...skill.missing.env.map((e) => `env:${e}`),
    ...skill.missing.config.map((c) => `config:${c}`),
    ...skill.missing.os.map((o) => `os:${o}`),
  ];
  const reasons: string[] = [];
  if (skill.disabled) {
    reasons.push("disabled");
  }
  if (skill.blockedByAllowlist) {
    reasons.push("blocked by allowlist");
  }

  return html`
    <div class="skill-details">
      <div class="skill-details__desc">${skill.description}</div>

      ${
        missing.length > 0
          ? html`
            <div class="skill-details__missing">
              <span class="skill-details__label">Missing:</span>
              ${missing.map((m) => html`<span class="chip chip-warn">${m}</span>`)}
            </div>
          `
          : nothing
      }
      ${
        reasons.length > 0
          ? html`
            <div class="skill-details__reasons">
              <span class="skill-details__label">Reason:</span> ${reasons.join(", ")}
            </div>
          `
          : nothing
      }
      ${
        message
          ? html`<div
            class="skill-details__message"
            style="color: ${
              message.kind === "error"
                ? "var(--danger-color, #d14343)"
                : "var(--success-color, #0a7f5a)"
            };"
          >
            ${message.message}
          </div>`
          : nothing
      }
      ${
        skill.primaryEnv
          ? html`
            <div class="skill-details__apikey">
              <div class="field">
                <span>API key</span>
                <input
                  type="password"
                  .value=${apiKey}
                  @input=${(e: Event) => props.onEdit(skill.skillKey, (e.target as HTMLInputElement).value)}
                />
              </div>
              <button class="btn btn--sm primary" ?disabled=${busy} @click=${() => props.onSaveKey(skill.skillKey)}>
                Save key
              </button>
            </div>
          `
          : nothing
      }
    </div>
  `;
}
