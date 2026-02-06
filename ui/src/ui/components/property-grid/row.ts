/**
 * Property Row Component
 *
 * Renders a single row in the property grid with path and value columns.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { PropertyDefinition, PropertyRowContext, SearchMatch } from "./types";
import { renderEditor } from "./editors";
import { splitByHighlights } from "./utils/search";

/**
 * Render a property grid row
 */
export function renderPropertyRow(ctx: PropertyRowContext): TemplateResult {
  const { def, isModified, searchMatch } = ctx;

  // Section header rows
  if (def.isGroupHeader) {
    return renderSectionRow(ctx);
  }

  // Regular property rows
  return html`
    <div
      class="pg-row ${isModified ? "pg-row--modified" : ""}"
      data-path=${def.pathKey}
      data-depth=${def.depth}
      style="--depth: ${def.depth}"
    >
      <div class="pg-row__path">
        ${renderIndent(def.depth)}
        ${renderPath(def, searchMatch)}
      </div>
      <div class="pg-row__value">
        ${renderEditor(ctx)}
      </div>
    </div>
  `;
}

/**
 * Render a section header row (for objects/arrays)
 */
function renderSectionRow(ctx: PropertyRowContext): TemplateResult {
  const { def, isModified, searchMatch, onExpand } = ctx;

  return html`
    <div
      class="pg-row pg-row--section ${isModified ? "pg-row--modified" : ""} ${def.isExpanded ? "pg-row--expanded" : ""}"
      data-path=${def.pathKey}
      data-depth=${def.depth}
      style="--depth: ${def.depth}"
    >
      <div class="pg-row__path pg-row__path--section" @click=${onExpand}>
        ${renderIndent(def.depth)}
        <span class="pg-row__chevron ${def.isExpanded ? "pg-row__chevron--open" : ""}">
          ▶
        </span>
        ${renderPath(def, searchMatch)}
      </div>
      <div class="pg-row__value pg-row__value--section">
        ${renderEditor(ctx)}
      </div>
    </div>
  `;
}

/**
 * Render indentation guides
 */
function renderIndent(depth: number): TemplateResult | typeof nothing {
  if (depth === 0) {
    return nothing;
  }

  const guides: TemplateResult[] = [];
  for (let i = 0; i < depth; i++) {
    guides.push(
      html`
        <span class="pg-row__indent-guide"></span>
      `,
    );
  }

  return html`<span class="pg-row__indent">${guides}</span>`;
}

/**
 * Render the property path with optional search highlighting
 */
function renderPath(def: PropertyDefinition, searchMatch: SearchMatch | null): TemplateResult {
  // Show the last path segment as the main label
  const lastSegment = def.path.at(-1) ?? "";
  const parentPath = def.path.slice(0, -1).join(".");

  // If there's a search match with path ranges, highlight them
  if (searchMatch?.inPath && searchMatch.pathRanges.length > 0) {
    const parts = splitByHighlights(def.pathKey, searchMatch.pathRanges);
    return html`
      <span class="pg-row__path-text">
        ${parts.map((part) =>
          part.highlight
            ? html`<mark class="pg-row__match">${part.text}</mark>`
            : html`<span>${part.text}</span>`,
        )}
      </span>
      ${
        def.description
          ? html`<span class="pg-row__path-desc" title=${def.description}>ⓘ</span>`
          : nothing
      }
    `;
  }

  // Normal path display with hierarchy coloring
  return html`
    <span class="pg-row__path-text">
      ${parentPath ? html`<span class="pg-row__path-parent">${parentPath}.</span>` : nothing}
      <span class="pg-row__path-key">${lastSegment}</span>
    </span>
    ${
      def.description
        ? html`<span class="pg-row__path-desc" title=${def.description}>ⓘ</span>`
        : nothing
    }
  `;
}

/**
 * Render a separator row
 */
export function renderSeparatorRow(): TemplateResult {
  return html`
    <div class="pg-row pg-row--separator"></div>
  `;
}
