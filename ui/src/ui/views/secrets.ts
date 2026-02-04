import { html, nothing } from "lit";
import { icons } from "../icons.js";

export type SecretsProps = {
  loading: boolean;
  keys: string[];
  error: string | null;
  form: {
    key: string;
    value: string;
  } | null;
  saving: boolean;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (key: string) => void;
  onDelete: (key: string) => void;
  onFormClose: () => void;
  onFormUpdate: (patch: { key?: string; value?: string }) => void;
  onFormSave: () => void;
};

export function renderSecrets(props: SecretsProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Secrets</div>
          <div class="card-sub">Manage secure environment variables and tokens.</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Loading…" : "Refresh"}
          </button>
          <button class="btn primary" @click=${props.onAdd}>
            ${icons.plus} Add Secret
          </button>
        </div>
      </div>

      ${props.error
        ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
        : nothing}

      <div class="list" style="margin-top: 16px;">
        ${props.keys.length === 0
          ? html`<div class="muted" style="padding: 20px; text-align: center;">
              ${props.loading ? "Loading secrets..." : "No secrets found."}
            </div>`
          : props.keys.map((key) => renderSecretItem(key, props))}
      </div>
    </section>

    ${props.form ? renderSecretForm(props.form, props.saving, props) : nothing}
  `;
}

function renderSecretItem(key: string, props: SecretsProps) {
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title mono" style="font-size: 13px;">${key}</div>
      </div>
      <div class="list-meta">
        <button class="btn btn--sm" @click=${() => props.onEdit(key)}>
          Edit Value
        </button>
        <button class="btn btn--sm danger" @click=${() => props.onDelete(key)}>
          ${icons.trash}
        </button>
      </div>
    </div>
  `;
}

function renderSecretForm(
  form: { key: string; value: string },
  saving: boolean,
  props: SecretsProps,
) {
  const isEditing = props.keys.includes(form.key) && form.key !== "";

  return html`
    <div class="exec-approval-overlay">
      <div class="exec-approval-card">
        <div class="exec-approval-header">
          <div class="exec-approval-title">
            ${isEditing ? "Update Secret" : "Add Secret"}
          </div>
          <button class="btn btn--sm" @click=${props.onFormClose}>${icons.x}</button>
        </div>

        <div style="padding: 16px; display: grid; gap: 16px;">
          <div class="field">
            <span>Key (Name)</span>
            <input
              type="text"
              .value=${form.key}
              ?disabled=${isEditing}
              placeholder="e.g. GITHUB_TOKEN"
              @input=${(e: Event) =>
                props.onFormUpdate({ key: (e.target as HTMLInputElement).value })}
            />
            ${isEditing
              ? html`<div class="muted" style="font-size: 11px;">
                  Key cannot be changed once created.
                </div>`
              : nothing}
          </div>

          <div class="field">
            <span>Value</span>
            <textarea
              .value=${form.value}
              placeholder="Enter secret value..."
              style="min-height: 100px; font-family: monospace;"
              @input=${(e: Event) =>
                props.onFormUpdate({ value: (e.target as HTMLTextAreaElement).value })}
            ></textarea>
          </div>
        </div>

        <div class="exec-approval-actions" style="padding: 16px; border-top: 1px solid var(--border);">
          <button class="btn" @click=${props.onFormClose}>Cancel</button>
          <button
            class="btn primary"
            ?disabled=${saving || !form.key || !form.value}
            @click=${props.onFormSave}
          >
            ${saving ? "Saving..." : "Save Secret"}
          </button>
        </div>
      </div>
    </div>
  `;
}
