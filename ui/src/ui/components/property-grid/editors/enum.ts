/**
 * Enum Editor
 *
 * Segmented control (for ≤4 options) or dropdown (for >4 options)
 * for enum properties.
 */

import { html, type TemplateResult } from "lit";
import type { PropertyRowContext } from "../types";

const SEGMENTED_MAX = 4;

/**
 * Render an enum editor
 */
export function renderEnumEditor(ctx: PropertyRowContext): TemplateResult {
  const { def, value, isModified, disabled, onPatch } = ctx;
  const options = def.enumValues ?? [];
  const currentValue = value ?? def.defaultValue;

  // Use segmented control for small option sets
  if (options.length <= SEGMENTED_MAX) {
    return renderSegmentedControl(options, currentValue, isModified, disabled, onPatch);
  }

  // Use dropdown for larger option sets
  return renderDropdown(options, currentValue, isModified, disabled, onPatch);
}

/**
 * Render segmented button control
 */
function renderSegmentedControl(
  options: unknown[],
  currentValue: unknown,
  isModified: boolean,
  disabled: boolean,
  onPatch: (value: unknown) => void,
): TemplateResult {
  return html`
    <div class="pg-editor pg-editor--segmented ${isModified ? "pg-editor--modified" : ""}">
      ${options.map(
        (opt) => html`
          <button
            type="button"
            class="pg-editor__segment ${isOptionSelected(opt, currentValue) ? "pg-editor__segment--active" : ""}"
            ?disabled=${disabled}
            @click=${() => onPatch(opt)}
          >
            ${formatOptionLabel(opt)}
          </button>
        `,
      )}
    </div>
  `;
}

/**
 * Render dropdown select
 */
function renderDropdown(
  options: unknown[],
  currentValue: unknown,
  isModified: boolean,
  disabled: boolean,
  onPatch: (value: unknown) => void,
): TemplateResult {
  const selectedIndex = options.findIndex((opt) => isOptionSelected(opt, currentValue));

  return html`
    <div class="pg-editor pg-editor--select ${isModified ? "pg-editor--modified" : ""}">
      <select
        class="pg-editor__select"
        ?disabled=${disabled}
        @change=${(e: Event) => {
          const idx = (e.target as HTMLSelectElement).selectedIndex - 1;
          onPatch(idx >= 0 ? options[idx] : undefined);
        }}
      >
        <option value="" ?selected=${selectedIndex < 0}>Select...</option>
        ${options.map(
          (opt, idx) => html`
            <option value=${String(idx)} ?selected=${idx === selectedIndex}>
              ${formatOptionLabel(opt)}
            </option>
          `,
        )}
      </select>
      <span class="pg-editor__select-arrow">▼</span>
    </div>
  `;
}

/**
 * Check if an option is the selected value
 */
function isOptionSelected(opt: unknown, value: unknown): boolean {
  if (opt === value) {
    return true;
  }
  // Handle string comparison for mixed types
  return String(opt) === String(value);
}

/**
 * Format an option value for display
 */
function formatOptionLabel(opt: unknown): string {
  if (opt === null) {
    return "null";
  }
  if (opt === undefined) {
    return "undefined";
  }
  if (typeof opt === "boolean") {
    return opt ? "true" : "false";
  }
  if (typeof opt === "string" || typeof opt === "number") {
    return String(opt);
  }
  // For objects, use JSON.stringify to avoid [object Object]
  try {
    return JSON.stringify(opt);
  } catch {
    return "[complex value]";
  }
}
