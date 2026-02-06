/**
 * String Editor
 *
 * Inline text input for string properties.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { PropertyRowContext } from "../types";

/**
 * Render a string editor
 */
/**
 * Safely convert an unknown value to string for display
 */
function toDisplayString(val: unknown): string {
  if (val === null || val === undefined) {
    return "";
  }
  if (typeof val === "string") {
    return val;
  }
  if (typeof val === "number" || typeof val === "boolean") {
    return String(val);
  }
  // For objects, use JSON.stringify to avoid [object Object]
  try {
    return JSON.stringify(val);
  } catch {
    return "[complex value]";
  }
}

export function renderStringEditor(ctx: PropertyRowContext): TemplateResult {
  const { def, value, isModified, disabled, onPatch } = ctx;
  const displayValue = value ?? "";
  const inputType = def.sensitive ? "password" : "text";
  const placeholder =
    def.defaultValue !== undefined
      ? `Default: ${toDisplayString(def.defaultValue)}`
      : def.sensitive
        ? "••••"
        : "";

  return html`
    <div class="pg-editor pg-editor--string ${isModified ? "pg-editor--modified" : ""}">
      <input
        type=${inputType}
        class="pg-editor__input"
        .value=${toDisplayString(displayValue)}
        placeholder=${placeholder}
        ?disabled=${disabled}
        @input=${(e: Event) => {
          const val = (e.target as HTMLInputElement).value;
          onPatch(val);
        }}
        @blur=${(e: Event) => {
          const val = (e.target as HTMLInputElement).value.trim();
          // Convert empty string to undefined to remove from config
          onPatch(val || undefined);
        }}
      />
      ${
        def.defaultValue !== undefined && value !== undefined && value !== def.defaultValue
          ? html`
            <button
              type="button"
              class="pg-editor__reset"
              title="Reset to default"
              ?disabled=${disabled}
              @click=${() => onPatch(def.defaultValue)}
            >
              ↺
            </button>
          `
          : nothing
      }
    </div>
  `;
}
