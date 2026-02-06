/**
 * Boolean Editor
 *
 * Toggle switch for boolean properties.
 */

import { html, type TemplateResult } from "lit";
import type { PropertyRowContext } from "../types";

/**
 * Render a boolean editor (toggle switch)
 */
export function renderBooleanEditor(ctx: PropertyRowContext): TemplateResult {
  const { def, value, isModified, disabled, onPatch } = ctx;
  const checked = value === true || (value === undefined && def.defaultValue === true);

  return html`
    <label class="pg-editor pg-editor--boolean ${isModified ? "pg-editor--modified" : ""} ${disabled ? "pg-editor--disabled" : ""}">
      <input
        type="checkbox"
        class="pg-editor__checkbox"
        .checked=${checked}
        ?disabled=${disabled}
        @change=${(e: Event) => {
          onPatch((e.target as HTMLInputElement).checked);
        }}
      />
      <span class="pg-editor__toggle">
        <span class="pg-editor__toggle-track"></span>
        <span class="pg-editor__toggle-thumb"></span>
      </span>
      <span class="pg-editor__toggle-label">${checked ? "On" : "Off"}</span>
    </label>
  `;
}
