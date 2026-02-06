/**
 * Property Grid Component
 *
 * VS Code-style hierarchical settings UI with inline editors.
 *
 * @example
 * ```typescript
 * import { renderPropertyGrid, createInitialExpandedPaths, toggleExpansion } from './property-grid';
 *
 * const config: PropertyGridConfig = {
 *   schema: myJsonSchema,
 *   value: currentConfig,
 *   uiHints: {},
 *   searchQuery: '',
 *   expandedPaths: createInitialExpandedPaths(myJsonSchema, currentConfig, {}),
 *   disabled: false,
 *   showModified: true,
 *   originalValue: savedConfig,
 *   onPatch: (path, value) => updateConfig(path, value),
 *   onExpandToggle: (pathKey) => setExpandedPaths(toggleExpansion(expandedPaths, pathKey)),
 *   onSearchChange: (query) => setSearchQuery(query),
 * };
 *
 * return renderPropertyGrid(config);
 * ```
 */

// Main component
export {
  renderPropertyGrid,
  createInitialExpandedPaths,
  toggleExpansion,
  expandAll,
  collapseAll,
} from "./property-grid";

// Types
export type {
  PropertyGridConfig,
  PropertyDefinition,
  PropertyRowContext,
  PropertyType,
  JsonSchema,
  SearchMatch,
  SearchResult,
  FlattenedSchema,
  EditorFactory,
  EditorRegistry,
} from "./types";

// Utilities
export {
  flattenSchema,
  schemaType,
  defaultValue,
  pathKey,
  hintForPath,
  humanize,
  isSensitivePath,
  getValueAtPath,
  valuesAreDifferent,
} from "./utils/flatten";

export {
  searchProperties,
  filterVisibleResults,
  expandParentsForMatches,
  splitByHighlights,
  type HighlightPart,
} from "./utils/search";

export {
  computeDiff,
  isPropertyModified,
  getModifiedPaths,
  truncateValue,
  type ChangeEntry,
} from "./utils/diff";

// Editors (for custom extension)
export {
  renderEditor,
  renderStringEditor,
  renderNumberEditor,
  renderBooleanEditor,
  renderEnumEditor,
  renderArrayEditor,
  renderArrayItemControls,
  renderObjectEditor,
} from "./editors";

// Row rendering
export { renderPropertyRow, renderSeparatorRow } from "./row";
