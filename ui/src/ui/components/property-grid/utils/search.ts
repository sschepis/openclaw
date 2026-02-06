/**
 * Search Utilities
 *
 * Search and filter functionality for the property grid with
 * match highlighting support.
 */

import type { PropertyDefinition, SearchResult } from "../types";

/**
 * Search properties by query and return scored results
 */
export function searchProperties(definitions: PropertyDefinition[], query: string): SearchResult[] {
  const trimmed = query.trim();

  // No query - return all with null match
  if (!trimmed) {
    return definitions.map((def) => ({
      def,
      match: null,
      score: 0,
    }));
  }

  const terms = trimmed.toLowerCase().split(/\s+/);
  const results: SearchResult[] = [];

  for (const def of definitions) {
    const pathLower = def.pathKey.toLowerCase();
    const labelLower = def.label.toLowerCase();
    const descLower = (def.description ?? "").toLowerCase();

    let score = 0;
    const pathRanges: [number, number][] = [];
    let inDescription = false;

    for (const term of terms) {
      // Exact path segment match (highest score)
      if (def.path.some((seg) => String(seg).toLowerCase() === term)) {
        score += 100;
      }
      // Path contains term
      else if (pathLower.includes(term)) {
        score += 50;
        // Find ranges for highlighting
        let idx = pathLower.indexOf(term);
        while (idx !== -1) {
          pathRanges.push([idx, idx + term.length]);
          idx = pathLower.indexOf(term, idx + 1);
        }
      }
      // Label match
      else if (labelLower.includes(term)) {
        score += 30;
      }
      // Description match
      else if (descLower.includes(term)) {
        score += 10;
        inDescription = true;
      }
    }

    if (score > 0) {
      // Merge overlapping ranges
      const mergedRanges = mergeRanges(pathRanges);

      results.push({
        def,
        match: {
          inPath: mergedRanges.length > 0,
          inValue: false,
          inDescription,
          pathRanges: mergedRanges,
          valueRanges: [],
        },
        score,
      });
    }
  }

  // Sort by score descending
  return results.toSorted((a, b) => b.score - a.score);
}

/**
 * Merge overlapping or adjacent ranges
 */
function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) {
    return [];
  }

  // Sort by start position
  const sorted = [...ranges].toSorted((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];

    if (current[0] <= last[1]) {
      // Overlapping or adjacent - extend
      last[1] = Math.max(last[1], current[1]);
    } else {
      // Non-overlapping - add new range
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Filter search results to only include visible items
 * (accounting for collapsed parents)
 */
export function filterVisibleResults(
  results: SearchResult[],
  expandedPaths: Set<string>,
): SearchResult[] {
  const visible: SearchResult[] = [];
  const visibleParents = new Set<string>();

  // First pass: identify all items that match or are expanded
  for (const result of results) {
    const { def } = result;

    // Root level items are always potentially visible
    if (def.depth === 0) {
      visibleParents.add(def.pathKey);
      continue;
    }

    // Check if parent path is expanded
    if (def.parentPath && expandedPaths.has(def.parentPath)) {
      visibleParents.add(def.pathKey);
    }
  }

  // Second pass: filter to visible items
  for (const result of results) {
    const { def } = result;

    // Root level always visible
    if (def.depth === 0) {
      visible.push(result);
      continue;
    }

    // Check if all ancestor paths are expanded
    let isVisible = true;
    const pathParts = def.path.slice(0, -1);
    for (let i = 0; i < pathParts.length; i++) {
      const ancestorKey = pathParts.slice(0, i + 1).join(".");
      if (!expandedPaths.has(ancestorKey)) {
        isVisible = false;
        break;
      }
    }

    if (isVisible) {
      visible.push(result);
    }
  }

  return visible;
}

/**
 * Expand parent paths when searching to show matched items
 */
export function expandParentsForMatches(
  results: SearchResult[],
  currentExpanded: Set<string>,
): Set<string> {
  const newExpanded = new Set(currentExpanded);

  for (const result of results) {
    if (result.match && result.score > 0) {
      // Expand all parent paths
      const pathParts = result.def.path;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const parentKey = pathParts.slice(0, i + 1).join(".");
        newExpanded.add(parentKey);
      }
    }
  }

  return newExpanded;
}

/**
 * Split text into highlighted and non-highlighted parts
 */
export interface HighlightPart {
  text: string;
  highlight: boolean;
}

export function splitByHighlights(text: string, ranges: [number, number][]): HighlightPart[] {
  if (ranges.length === 0) {
    return [{ text, highlight: false }];
  }

  const parts: HighlightPart[] = [];
  let lastEnd = 0;

  for (const [start, end] of ranges.toSorted((a, b) => a[0] - b[0])) {
    if (start > lastEnd) {
      parts.push({ text: text.slice(lastEnd, start), highlight: false });
    }
    parts.push({ text: text.slice(start, end), highlight: true });
    lastEnd = end;
  }

  if (lastEnd < text.length) {
    parts.push({ text: text.slice(lastEnd), highlight: false });
  }

  return parts;
}
