/**
 * Object Editor
 *
 * Section header for object properties with expand/collapse.
 */

import { html, type TemplateResult } from "lit";
import type { PropertyRowContext } from "../types";

/**
 * Render an object section header
 */
export function renderObjectEditor(ctx: PropertyRowContext): TemplateResult {
  const { def, isModified, disabled, onExpand } = ctx;
  const childCount = Object.keys(def.schema.properties ?? {}).length;

  return html`
    <div class="pg-editor pg-editor--object ${isModified ? "pg-editor--modified" : ""}">
      <button
        type="button"
        class="pg-editor__object-toggle"
        ?disabled=${disabled}
        @click=${onExpand}
      >
        <span class="pg-editor__object-chevron ${def.isExpanded ? "pg-editor__object-chevron--open" : ""}">
          ▶
        </span>
        <span class="pg-editor__object-info">
          ${childCount} ${childCount === 1 ? "property" : "properties"}
        </span>
      </button>
    </div>
  `;
}
