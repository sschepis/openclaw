/**
 * Property Grid Types
 *
 * Core type definitions for the VS Code-style property grid settings UI.
 * The property grid displays JSON configuration as a flat list of hierarchical
 * property paths with inline editors.
 */

import type { ConfigUiHints } from "../../types";

/**
 * Supported property types derived from JSON Schema
 */
export type PropertyType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "enum"
  | "array"
  | "object"
  | "unknown";

/**
 * JSON Schema subset used by the property grid
 */
export type JsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  additionalProperties?: JsonSchema | boolean;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  nullable?: boolean;
};

/**
 * Property definition after schema flattening.
 * Represents a single row in the property grid.
 */
export interface PropertyDefinition {
  /** Full path segments, e.g., ['channels', 'telegram', 'token'] */
  path: string[];
  /** Dot-joined path, e.g., 'channels.telegram.token' */
  pathKey: string;
  /** Original schema node for this property */
  schema: JsonSchema;
  /** Resolved property type */
  type: PropertyType;
  /** Human-readable label from hints or schema title */
  label: string;
  /** Help text / description */
  description?: string;
  /** Default value from schema */
  defaultValue?: unknown;
  /** Enum options if type is 'enum' */
  enumValues?: unknown[];
  /** Whether field is required by schema */
  required: boolean;
  /** Whether value should be masked (passwords, tokens) */
  sensitive: boolean;
  /** Nesting depth for indentation */
  depth: number;
  /** Parent section key for grouping */
  parentPath?: string;
  /** True for object/section headers that can be collapsed */
  isGroupHeader: boolean;
  /** Current expansion state for group headers */
  isExpanded: boolean;
  /** Sort order from UI hints */
  order: number;
}

/**
 * Search match result for highlighting
 */
export interface SearchMatch {
  /** Match found in property path */
  inPath: boolean;
  /** Match found in value */
  inValue: boolean;
  /** Match found in description */
  inDescription: boolean;
  /** Character ranges to highlight in path */
  pathRanges: [number, number][];
  /** Character ranges to highlight in value */
  valueRanges: [number, number][];
}

/**
 * Search result with score for ranking
 */
export interface SearchResult {
  def: PropertyDefinition;
  match: SearchMatch | null;
  score: number;
}

/**
 * Row render context passed to editors
 */
export interface PropertyRowContext {
  /** Property definition */
  def: PropertyDefinition;
  /** Current value */
  value: unknown;
  /** Original value for diff comparison */
  originalValue?: unknown;
  /** Whether value differs from original */
  isModified: boolean;
  /** Search match info for highlighting */
  searchMatch: SearchMatch | null;
  /** Whether editing is disabled */
  disabled: boolean;
  /** Callback to update value */
  onPatch: (value: unknown) => void;
  /** Callback to toggle expansion for group headers */
  onExpand: () => void;
}

/**
 * Main property grid configuration
 */
export interface PropertyGridConfig {
  /** JSON Schema for the configuration */
  schema: JsonSchema | null;
  /** Current configuration value */
  value: Record<string, unknown> | null;
  /** UI hints for labels, ordering, etc. */
  uiHints: ConfigUiHints;
  /** Current search query */
  searchQuery: string;
  /** Set of expanded group path keys */
  expandedPaths: Set<string>;
  /** Whether all inputs are disabled */
  disabled: boolean;
  /** Whether to highlight modified values */
  showModified: boolean;
  /** Original value for diff comparison */
  originalValue?: Record<string, unknown> | null;
  /** Active section filter (null = show all) */
  activeSection?: string | null;
  /** Callback when a value is patched */
  onPatch: (path: string[], value: unknown) => void;
  /** Callback when a group is expanded/collapsed */
  onExpandToggle: (pathKey: string) => void;
  /** Callback when search query changes */
  onSearchChange: (query: string) => void;
}

/**
 * Flattened schema result from flattenSchema utility
 */
export interface FlattenedSchema {
  /** All property definitions in display order */
  definitions: PropertyDefinition[];
  /** Paths that could not be flattened */
  unsupportedPaths: string[];
}

/**
 * Editor factory function type
 */
export type EditorFactory = (ctx: PropertyRowContext) => import("lit").TemplateResult;

/**
 * Editor registry for custom type handling
 */
export type EditorRegistry = Partial<Record<PropertyType, EditorFactory>>;
