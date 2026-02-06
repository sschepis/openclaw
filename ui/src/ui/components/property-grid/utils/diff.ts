/**
 * Diff Utilities
 *
 * Change tracking and diff computation for the property grid.
 */

import type { PropertyDefinition } from "../types";
import { getValueAtPath, valuesAreDifferent } from "./flatten";

/**
 * Single change entry
 */
export interface ChangeEntry {
  pathKey: string;
  path: string[];
  from: unknown;
  to: unknown;
  label: string;
}

/**
 * Compute diff between original and current values
 */
export function computeDiff(
  original: Record<string, unknown> | null,
  current: Record<string, unknown> | null,
): ChangeEntry[] {
  if (!original || !current) {
    return [];
  }

  const changes: ChangeEntry[] = [];

  function compare(orig: unknown, curr: unknown, path: string[], label: string) {
    if (orig === curr) {
      return;
    }

    if (typeof orig !== typeof curr) {
      changes.push({
        pathKey: path.join("."),
        path,
        from: orig,
        to: curr,
        label,
      });
      return;
    }

    if (typeof orig !== "object" || orig === null || curr === null) {
      if (orig !== curr) {
        changes.push({
          pathKey: path.join("."),
          path,
          from: orig,
          to: curr,
          label,
        });
      }
      return;
    }

    if (Array.isArray(orig) && Array.isArray(curr)) {
      if (JSON.stringify(orig) !== JSON.stringify(curr)) {
        changes.push({
          pathKey: path.join("."),
          path,
          from: orig,
          to: curr,
          label,
        });
      }
      return;
    }

    const origObj = orig as Record<string, unknown>;
    const currObj = curr as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(origObj), ...Object.keys(currObj)]);

    for (const key of allKeys) {
      compare(origObj[key], currObj[key], [...path, key], key);
    }
  }

  compare(original, current, [], "");
  return changes;
}

/**
 * Check if a specific property is modified
 */
export function isPropertyModified(
  def: PropertyDefinition,
  original: Record<string, unknown> | null,
  current: Record<string, unknown> | null,
): boolean {
  if (!original || !current) {
    return false;
  }

  const origValue = getValueAtPath(original, def.path);
  const currValue = getValueAtPath(current, def.path);

  return valuesAreDifferent(origValue, currValue);
}

/**
 * Get set of modified path keys
 */
export function getModifiedPaths(
  definitions: PropertyDefinition[],
  original: Record<string, unknown> | null,
  current: Record<string, unknown> | null,
): Set<string> {
  const modified = new Set<string>();

  if (!original || !current) {
    return modified;
  }

  for (const def of definitions) {
    if (isPropertyModified(def, original, current)) {
      modified.add(def.pathKey);
    }
  }

  return modified;
}

/**
 * Truncate a value for display in diff panel
 */
export function truncateValue(value: unknown, maxLen = 40): string {
  let str: string;
  try {
    const json = JSON.stringify(value);
    str = json ?? String(value);
  } catch {
    str = String(value);
  }
  if (str.length <= maxLen) {
    return str;
  }
  return str.slice(0, maxLen - 3) + "...";
}
