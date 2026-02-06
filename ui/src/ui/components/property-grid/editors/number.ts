/**
 * Number Editor
 *
 * Inline number input for numeric properties.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { PropertyRowContext } from "../types";

/**
 * Safely convert an unknown value to string for display
 */
function toDisplayString(val: unknown): string {
  if (val === null || val === undefined) {
    return "";
  }
  if (typeof val === "number" || typeof val === "boolean" || typeof val === "string") {
    return String(val);
  }
  // For objects, use JSON.stringify to avoid [object Object]
  try {
    return JSON.stringify(val);
  } catch {
    return "[complex value]";
  }
}

/**
 * Render a number editor
 */
export function renderNumberEditor(ctx: PropertyRowContext): TemplateResult {
  const { def, value, isModified, disabled, onPatch } = ctx;
  const displayValue = value ?? def.defaultValue ?? "";
  const placeholder =
    def.defaultValue !== undefined ? `Default: ${toDisplayString(def.defaultValue)}` : "";

  return html`
    <div class="pg-editor pg-editor--number ${isModified ? "pg-editor--modified" : ""}">
      <button
        type="button"
        class="pg-editor__stepper pg-editor__stepper--dec"
        ?disabled=${disabled}
        @click=${() => {
          const num = typeof value === "number" ? value : 0;
          onPatch(num - 1);
        }}
      >
        −
      </button>
      <input
        type="number"
        class="pg-editor__input pg-editor__input--number"
        .value=${displayValue == null ? "" : toDisplayString(displayValue)}
        placeholder=${placeholder}
        ?disabled=${disabled}
        @input=${(e: Event) => {
          const raw = (e.target as HTMLInputElement).value;
          if (raw.trim() === "") {
            onPatch(undefined);
            return;
          }
          const parsed = Number(raw);
          onPatch(Number.isNaN(parsed) ? raw : parsed);
        }}
      />
      <button
        type="button"
        class="pg-editor__stepper pg-editor__stepper--inc"
        ?disabled=${disabled}
        @click=${() => {
          const num = typeof value === "number" ? value : 0;
          onPatch(num + 1);
        }}
      >
        +
      </button>
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
