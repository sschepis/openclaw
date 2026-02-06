/**
 * Array Editor
 *
 * Inline array display with expand/collapse and add item functionality.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { PropertyRowContext } from "../types";
import { defaultValue } from "../utils/flatten";

/**
 * Render an array editor
 */
export function renderArrayEditor(ctx: PropertyRowContext): TemplateResult {
  const { def, value, isModified, disabled, onPatch, onExpand } = ctx;
  const arr = Array.isArray(value) ? value : [];
  const itemSchema = Array.isArray(def.schema.items) ? def.schema.items[0] : def.schema.items;

  return html`
    <div class="pg-editor pg-editor--array ${isModified ? "pg-editor--modified" : ""}">
      <button
        type="button"
        class="pg-editor__array-toggle"
        ?disabled=${disabled}
        @click=${onExpand}
      >
        <span class="pg-editor__array-chevron ${def.isExpanded ? "pg-editor__array-chevron--open" : ""}">
          ▶
        </span>
        <span class="pg-editor__array-count">
          ${arr.length} item${arr.length !== 1 ? "s" : ""}
        </span>
      </button>
      ${
        itemSchema
          ? html`
            <button
              type="button"
              class="pg-editor__array-add"
              title="Add item"
              ?disabled=${disabled}
              @click=${(e: Event) => {
                e.stopPropagation();
                const newItem = defaultValue(itemSchema);
                onPatch([...arr, newItem]);
              }}
            >
              +
            </button>
          `
          : nothing
      }
    </div>
  `;
}

/**
 * Render array item row with delete button
 */
export function renderArrayItemControls(
  index: number,
  total: number,
  disabled: boolean,
  onDelete: () => void,
  onMoveUp?: () => void,
  onMoveDown?: () => void,
): TemplateResult {
  return html`
    <div class="pg-editor__array-item-controls">
      <span class="pg-editor__array-item-index">#${index + 1}</span>
      ${
        onMoveUp && index > 0
          ? html`
            <button
              type="button"
              class="pg-editor__array-item-btn"
              title="Move up"
              ?disabled=${disabled}
              @click=${onMoveUp}
            >
              ↑
            </button>
          `
          : nothing
      }
      ${
        onMoveDown && index < total - 1
          ? html`
            <button
              type="button"
              class="pg-editor__array-item-btn"
              title="Move down"
              ?disabled=${disabled}
              @click=${onMoveDown}
            >
              ↓
            </button>
          `
          : nothing
      }
      <button
        type="button"
        class="pg-editor__array-item-btn pg-editor__array-item-btn--delete"
        title="Delete item"
        ?disabled=${disabled}
        @click=${onDelete}
      >
        ×
      </button>
    </div>
  `;
}
