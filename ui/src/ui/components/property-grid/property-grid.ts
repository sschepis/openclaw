/**
 * Property Grid Component
 *
 * VS Code-style settings UI with hierarchical property paths and inline editors.
 * Renders JSON Schema configuration as a flat, searchable property list.
 */

import { html, nothing, type TemplateResult } from "lit";
import type {
  PropertyGridConfig,
  PropertyDefinition,
  PropertyRowContext,
  SearchResult,
} from "./types";
import { renderPropertyRow } from "./row";
import { computeDiff, truncateValue } from "./utils/diff";
import { flattenSchema, getValueAtPath } from "./utils/flatten";
import { searchProperties, expandParentsForMatches } from "./utils/search";

/**
 * Render the complete property grid
 */
export function renderPropertyGrid(config: PropertyGridConfig): TemplateResult {
  const {
    schema,
    value,
    uiHints,
    searchQuery,
    expandedPaths,
    disabled,
    showModified,
    originalValue,
    activeSection,
    onPatch,
    onExpandToggle,
    onSearchChange,
  } = config;

  // No schema - show placeholder
  if (!schema) {
    return html`
      <div class="pg">
        <div class="pg__empty">
          <span class="pg__empty-icon">⚙️</span>
          <span class="pg__empty-text">No schema available</span>
        </div>
      </div>
    `;
  }

  // Flatten schema to property definitions
  const { definitions, unsupportedPaths } = flattenSchema(
    schema,
    value ?? {},
    uiHints,
    [],
    0,
    expandedPaths,
  );

  // Filter by active section if specified
  let sectionFilteredDefs = definitions;
  if (activeSection) {
    sectionFilteredDefs = definitions.filter((def) => def.path[0] === activeSection);
  }

  // Apply search filter
  let searchResults: SearchResult[];
  let _effectiveExpanded = expandedPaths;

  if (searchQuery.trim()) {
    searchResults = searchProperties(sectionFilteredDefs, searchQuery);
    // Auto-expand parents of matched items
    _effectiveExpanded = expandParentsForMatches(searchResults, expandedPaths);
  } else {
    searchResults = sectionFilteredDefs.map((def) => ({ def, match: null, score: 0 }));
  }

  // Filter to only matching results when searching
  const visibleResults = searchQuery.trim()
    ? searchResults.filter((r) => r.score > 0)
    : searchResults;

  // Compute diff for change highlighting
  const diff = showModified ? computeDiff(originalValue ?? null, value) : [];
  const modifiedPaths = new Set(diff.map((d) => d.pathKey));

  return html`
    <div class="pg">
      ${renderHeader(searchQuery, onSearchChange, diff.length)}
      ${renderBody(
        visibleResults,
        value,
        originalValue,
        modifiedPaths,
        disabled,
        onPatch,
        onExpandToggle,
      )}
      ${unsupportedPaths.length > 0 ? renderUnsupportedWarning(unsupportedPaths) : nothing}
      ${diff.length > 0 ? renderDiffPanel(diff) : nothing}
    </div>
  `;
}

/**
 * Render the grid header with search and column labels
 */
function renderHeader(
  searchQuery: string,
  onSearchChange: (query: string) => void,
  changeCount: number,
): TemplateResult {
  return html`
    <div class="pg__header">
      <div class="pg__search">
        <span class="pg__search-icon">🔍</span>
        <input
          type="text"
          class="pg__search-input"
          placeholder="Search settings..."
          .value=${searchQuery}
          @input=${(e: Event) => onSearchChange((e.target as HTMLInputElement).value)}
        />
        ${
          searchQuery
            ? html`
              <button
                type="button"
                class="pg__search-clear"
                @click=${() => onSearchChange("")}
              >
                ×
              </button>
            `
            : nothing
        }
      </div>
      <div class="pg__column-headers">
        <div class="pg__column-header pg__column-header--path">
          Property
        </div>
        <div class="pg__column-header pg__column-header--value">
          Value
          ${changeCount > 0 ? html`<span class="pg__change-badge">${changeCount}</span>` : nothing}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the scrollable body with property rows
 */
function renderBody(
  results: SearchResult[],
  value: Record<string, unknown> | null,
  originalValue: Record<string, unknown> | null | undefined,
  modifiedPaths: Set<string>,
  disabled: boolean,
  onPatch: (path: string[], value: unknown) => void,
  onExpandToggle: (pathKey: string) => void,
): TemplateResult {
  if (results.length === 0) {
    return html`
      <div class="pg__body pg__body--empty">
        <div class="pg__empty">
          <span class="pg__empty-icon">🔎</span>
          <span class="pg__empty-text">No settings found</span>
        </div>
      </div>
    `;
  }

  return html`
    <div class="pg__body">
      ${results.map((result) => {
        const { def, match } = result;
        const currentValue = getValueAtPath(value ?? {}, def.path);
        const origValue = originalValue ? getValueAtPath(originalValue, def.path) : undefined;
        const isModified = modifiedPaths.has(def.pathKey);

        const ctx: PropertyRowContext = {
          def,
          value: currentValue,
          originalValue: origValue,
          isModified,
          searchMatch: match,
          disabled,
          onPatch: (newValue: unknown) => onPatch(def.path, newValue),
          onExpand: () => onExpandToggle(def.pathKey),
        };

        return renderPropertyRow(ctx);
      })}
    </div>
  `;
}

/**
 * Render warning for unsupported schema paths
 */
function renderUnsupportedWarning(paths: string[]): TemplateResult {
  return html`
    <div class="pg__warning">
      <span class="pg__warning-icon">⚠️</span>
      <span class="pg__warning-text">
        ${paths.length} path${paths.length !== 1 ? "s" : ""} cannot be edited in this view.
        Use Raw mode for full access.
      </span>
    </div>
  `;
}

/**
 * Render the diff panel showing pending changes
 */
function renderDiffPanel(
  diff: Array<{ pathKey: string; path: string[]; from: unknown; to: unknown; label: string }>,
): TemplateResult {
  return html`
    <details class="pg__diff">
      <summary class="pg__diff-summary">
        <span class="pg__diff-count">
          ${diff.length} pending change${diff.length !== 1 ? "s" : ""}
        </span>
        <span class="pg__diff-chevron">▼</span>
      </summary>
      <div class="pg__diff-content">
        ${diff.map(
          (change) => html`
            <div class="pg__diff-item">
              <span class="pg__diff-path">${change.pathKey}</span>
              <span class="pg__diff-values">
                <span class="pg__diff-from">${truncateValue(change.from)}</span>
                <span class="pg__diff-arrow">→</span>
                <span class="pg__diff-to">${truncateValue(change.to)}</span>
              </span>
            </div>
          `,
        )}
      </div>
    </details>
  `;
}

/**
 * Create initial expanded paths set (expand top-level by default)
 */
export function createInitialExpandedPaths(
  schema: PropertyGridConfig["schema"],
  _value: Record<string, unknown> | null,
  _uiHints: PropertyGridConfig["uiHints"],
): Set<string> {
  if (!schema || !schema.properties) {
    return new Set();
  }

  // Expand all top-level sections by default
  return new Set(Object.keys(schema.properties));
}

/**
 * Toggle expansion state for a path
 */
export function toggleExpansion(expandedPaths: Set<string>, pathKey: string): Set<string> {
  const next = new Set(expandedPaths);
  if (next.has(pathKey)) {
    next.delete(pathKey);
  } else {
    next.add(pathKey);
  }
  return next;
}

/**
 * Expand all paths
 */
export function expandAll(definitions: PropertyDefinition[]): Set<string> {
  const expanded = new Set<string>();
  for (const def of definitions) {
    if (def.isGroupHeader) {
      expanded.add(def.pathKey);
    }
  }
  return expanded;
}

/**
 * Collapse all paths
 */
export function collapseAll(): Set<string> {
  return new Set();
}
