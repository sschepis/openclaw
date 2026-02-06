/**
 * Editor Factory
 *
 * Routes property types to their appropriate editors.
 */

import { html, type TemplateResult } from "lit";
import type { PropertyRowContext, EditorRegistry } from "../types";
import { renderArrayEditor } from "./array";
import { renderBooleanEditor } from "./boolean";
import { renderEnumEditor } from "./enum";
import { renderNumberEditor } from "./number";
import { renderObjectEditor } from "./object";
import { renderStringEditor } from "./string";

/**
 * Default editor registry
 */
const defaultEditors: EditorRegistry = {
  string: renderStringEditor,
  number: renderNumberEditor,
  integer: renderNumberEditor,
  boolean: renderBooleanEditor,
  enum: renderEnumEditor,
  array: renderArrayEditor,
  object: renderObjectEditor,
};

/**
 * Render the appropriate editor for a property
 */
export function renderEditor(
  ctx: PropertyRowContext,
  customEditors?: EditorRegistry,
): TemplateResult {
  const { def } = ctx;
  const editors = { ...defaultEditors, ...customEditors };
  const editor = editors[def.type];

  if (editor) {
    return editor(ctx);
  }

  // Fallback for unknown types - show as JSON
  return renderUnknownEditor(ctx);
}

/**
 * Fallback editor for unknown types - JSON textarea
 */
function renderUnknownEditor(ctx: PropertyRowContext): TemplateResult {
  const { def, value, isModified, disabled, onPatch } = ctx;
  const jsonValue = value !== undefined ? JSON.stringify(value, null, 2) : "";

  return html`
    <div class="pg-editor pg-editor--unknown ${isModified ? "pg-editor--modified" : ""}">
      <textarea
        class="pg-editor__json"
        placeholder="Enter JSON value..."
        rows="2"
        ?disabled=${disabled}
        .value=${jsonValue}
        @change=${(e: Event) => {
          const raw = (e.target as HTMLTextAreaElement).value.trim();
          if (!raw) {
            onPatch(undefined);
            return;
          }
          try {
            onPatch(JSON.parse(raw));
          } catch {
            // Keep invalid JSON in textarea but don't update value
          }
        }}
      ></textarea>
      <span class="pg-editor__unknown-type" title="Unknown type">
        ${def.type}
      </span>
    </div>
  `;
}

// Re-export individual editors for direct use
export { renderStringEditor } from "./string";
export { renderNumberEditor } from "./number";
export { renderBooleanEditor } from "./boolean";
export { renderEnumEditor } from "./enum";
export { renderArrayEditor, renderArrayItemControls } from "./array";
export { renderObjectEditor } from "./object";
