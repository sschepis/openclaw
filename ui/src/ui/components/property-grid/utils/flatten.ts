/**
 * Schema Flattening Utilities
 *
 * Converts nested JSON Schema into a flat list of PropertyDefinition objects
 * suitable for rendering in the property grid.
 */

import type { ConfigUiHints, ConfigUiHint } from "../../../types";
import type {
  JsonSchema,
  PropertyDefinition,
  PropertyType,
  FlattenedSchema,
} from "../types";

const META_KEYS = new Set(["title", "description", "default", "nullable"]);

/**
 * Sensitive path patterns for password/token masking
 */
const SENSITIVE_PATTERNS = ["token", "password", "secret", "apikey", "key"];

/**
 * Check if a schema is essentially "any" (no type constraints)
 */
function isAnySchema(schema: JsonSchema): boolean {
  const keys = Object.keys(schema ?? {}).filter((key) => !META_KEYS.has(key));
  return keys.length === 0;
}

/**
 * Extract the primary type from a schema
 */
export function schemaType(schema: JsonSchema): string | undefined {
  if (!schema) {
    return undefined;
  }
  if (Array.isArray(schema.type)) {
    const filtered = schema.type.filter((t) => t !== "null");
    return filtered[0] ?? schema.type[0];
  }
  return schema.type;
}

/**
 * Get a default value for a schema type
 */
export function defaultValue(schema?: JsonSchema): unknown {
  if (!schema) {
    return "";
  }
  if (schema.default !== undefined) {
    return schema.default;
  }
  const type = schemaType(schema);
  switch (type) {
    case "object":
      return {};
    case "array":
      return [];
    case "boolean":
      return false;
    case "number":
    case "integer":
      return 0;
    case "string":
      return "";
    default:
      return "";
  }
}

/**
 * Convert path array to dot-joined key
 */
export function pathKey(path: Array<string | number>): string {
  return path.filter((segment) => typeof segment === "string").join(".");
}

/**
 * Get UI hint for a path, supporting wildcards
 */
export function hintForPath(
  path: Array<string | number>,
  hints: ConfigUiHints
): ConfigUiHint | undefined {
  const key = pathKey(path);
  const direct = hints[key];
  if (direct) {
    return direct;
  }
  const segments = key.split(".");
  for (const [hintKey, hint] of Object.entries(hints)) {
    if (!hintKey.includes("*")) {
      continue;
    }
    const hintSegments = hintKey.split(".");
    if (hintSegments.length !== segments.length) {
      continue;
    }
    let match = true;
    for (let i = 0; i < segments.length; i += 1) {
      if (hintSegments[i] !== "*" && hintSegments[i] !== segments[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      return hint;
    }
  }
  return undefined;
}

/**
 * Convert a raw string to human-readable label
 */
export function humanize(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/^./, (m) => m.toUpperCase());
}

/**
 * Check if a path should be treated as sensitive (masked)
 */
export function isSensitivePath(path: Array<string | number>): boolean {
  const key = pathKey(path).toLowerCase();
  return SENSITIVE_PATTERNS.some(
    (pattern) => key.includes(pattern) || key.endsWith("key")
  );
}

/**
 * Resolve the PropertyType from a JSON Schema
 */
function resolvePropertyType(schema: JsonSchema): PropertyType {
  if (schema.enum) {
    return "enum";
  }

  const type = schemaType(schema);

  // Handle anyOf/oneOf with literal values as enum
  if (schema.anyOf || schema.oneOf) {
    const variants = schema.anyOf ?? schema.oneOf ?? [];
    const nonNull = variants.filter(
      (v) =>
        !(v.type === "null" || (Array.isArray(v.type) && v.type.includes("null")))
    );

    // Check if all variants are literals
    const allLiterals = nonNull.every(
      (v) => v.const !== undefined || (v.enum && v.enum.length === 1)
    );
    if (allLiterals && nonNull.length > 0) {
      return "enum";
    }
  }

  switch (type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "integer":
      return "integer";
    case "boolean":
      return "boolean";
    case "array":
      return "array";
    case "object":
      return "object";
    default:
      return "unknown";
  }
}

/**
 * Extract enum values from schema including anyOf/oneOf literals
 */
function extractEnumValues(schema: JsonSchema): unknown[] | undefined {
  if (schema.enum) {
    return schema.enum.filter((v) => v != null);
  }

  const variants = schema.anyOf ?? schema.oneOf;
  if (!variants) {
    return undefined;
  }

  const values: unknown[] = [];
  for (const v of variants) {
    if (v.type === "null") {
      continue;
    }
    if (v.const !== undefined && v.const !== null) {
      values.push(v.const);
    } else if (v.enum && v.enum.length === 1 && v.enum[0] != null) {
      values.push(v.enum[0]);
    }
  }

  return values.length > 0 ? values : undefined;
}

/**
 * Flatten a JSON Schema into a list of PropertyDefinition objects
 */
export function flattenSchema(
  schema: JsonSchema,
  value: unknown,
  hints: ConfigUiHints,
  path: string[] = [],
  depth: number = 0,
  expandedPaths: Set<string> = new Set()
): FlattenedSchema {
  const results: PropertyDefinition[] = [];
  const unsupportedPaths: string[] = [];
  const type = resolvePropertyType(schema);
  const pKey = pathKey(path);
  const hint = hintForPath(path, hints);

  // Handle object types
  if (type === "object" && schema.properties) {
    // Add section header row for nested objects (not root)
    if (path.length > 0) {
      const isExpanded = expandedPaths.has(pKey);
      results.push({
        path,
        pathKey: pKey,
        schema,
        type: "object",
        label: hint?.label ?? schema.title ?? humanize(path.at(-1) ?? ""),
        description: hint?.help ?? schema.description,
        depth,
        parentPath: path.length > 1 ? pathKey(path.slice(0, -1)) : undefined,
        isGroupHeader: true,
        isExpanded,
        order: hint?.order ?? 50,
        required: false,
        sensitive: false,
      });

      // If collapsed, skip children
      if (!isExpanded) {
        return { definitions: results, unsupportedPaths };
      }
    }

    // Recursively flatten properties
    const entries = Object.entries(schema.properties);
    const sorted = entries.sort((a, b) => {
      const orderA = hintForPath([...path, a[0]], hints)?.order ?? 50;
      const orderB = hintForPath([...path, b[0]], hints)?.order ?? 50;
      return orderA - orderB || a[0].localeCompare(b[0]);
    });

    const obj =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    for (const [key, propSchema] of sorted) {
      const propValue = obj[key];
      const nested = flattenSchema(
        propSchema,
        propValue,
        hints,
        [...path, key],
        path.length === 0 ? 0 : depth + 1,
        expandedPaths
      );
      results.push(...nested.definitions);
      unsupportedPaths.push(...nested.unsupportedPaths);
    }

    // Handle additionalProperties
    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === "object" &&
      !isAnySchema(schema.additionalProperties)
    ) {
      const reserved = new Set(Object.keys(schema.properties ?? {}));
      const extras = Object.entries(obj).filter(([k]) => !reserved.has(k));
      for (const [key, extraValue] of extras) {
        const nested = flattenSchema(
          schema.additionalProperties,
          extraValue,
          hints,
          [...path, key],
          depth + 1,
          expandedPaths
        );
        results.push(...nested.definitions);
        unsupportedPaths.push(...nested.unsupportedPaths);
      }
    }
  } else if (type === "array") {
    // Array type - show as expandable with item count
    const isExpanded = expandedPaths.has(pKey);
    const arr = Array.isArray(value) ? value : [];

    results.push({
      path,
      pathKey: pKey,
      schema,
      type: "array",
      label: hint?.label ?? schema.title ?? humanize(path.at(-1) ?? ""),
      description: hint?.help ?? schema.description,
      defaultValue: schema.default,
      depth,
      parentPath: path.length > 1 ? pathKey(path.slice(0, -1)) : undefined,
      isGroupHeader: true,
      isExpanded,
      order: hint?.order ?? 50,
      required: false,
      sensitive: false,
    });

    // If expanded, show array items
    if (isExpanded) {
      const itemSchema = Array.isArray(schema.items)
        ? schema.items[0]
        : schema.items;
      if (itemSchema) {
        for (let i = 0; i < arr.length; i++) {
          const nested = flattenSchema(
            itemSchema,
            arr[i],
            hints,
            [...path, i.toString()],
            depth + 1,
            expandedPaths
          );
          results.push(...nested.definitions);
          unsupportedPaths.push(...nested.unsupportedPaths);
        }
      } else {
        unsupportedPaths.push(pKey);
      }
    }
  } else {
    // Leaf property
    results.push({
      path,
      pathKey: pKey,
      schema,
      type,
      label: hint?.label ?? schema.title ?? humanize(path.at(-1) ?? ""),
      description: hint?.help ?? schema.description,
      defaultValue: schema.default,
      enumValues: extractEnumValues(schema),
      depth,
      parentPath: path.length > 1 ? pathKey(path.slice(0, -1)) : undefined,
      isGroupHeader: false,
      isExpanded: false,
      order: hint?.order ?? 50,
      required: false,
      sensitive: hint?.sensitive ?? isSensitivePath(path),
    });
  }

  return { definitions: results, unsupportedPaths };
}

/**
 * Get value at a path from a nested object
 */
export function getValueAtPath(
  obj: unknown,
  path: string[]
): unknown {
  let current = obj;
  for (const segment of path) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Check if two values are different (for modification detection)
 */
export function valuesAreDifferent(a: unknown, b: unknown): boolean {
  if (a === b) {
    return false;
  }
  if (a == null && b == null) {
    return false;
  }
  if (a == null || b == null) {
    return true;
  }
  if (typeof a !== typeof b) {
    return true;
  }
  if (typeof a !== "object") {
    return a !== b;
  }
  try {
    return JSON.stringify(a) !== JSON.stringify(b);
  } catch {
    return true;
  }
}
