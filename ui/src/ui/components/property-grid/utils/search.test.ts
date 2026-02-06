/**
 * Tests for search utilities
 */

import { describe, it, expect } from "vitest";
import type { PropertyDefinition } from "../types";
import {
  searchProperties,
  filterVisibleResults,
  expandParentsForMatches,
  splitByHighlights,
} from "./search";

function createDef(
  pathKey: string,
  overrides: Partial<PropertyDefinition> = {},
): PropertyDefinition {
  const path = pathKey.split(".");
  return {
    path,
    pathKey,
    schema: { type: "string" },
    type: "string",
    label: path.at(-1) ?? "",
    depth: path.length - 1,
    isGroupHeader: false,
    isExpanded: false,
    order: 50,
    required: false,
    sensitive: false,
    ...overrides,
  };
}

describe("searchProperties", () => {
  it("returns all with null match when no query", () => {
    const defs = [createDef("a.b"), createDef("c.d")];
    const results = searchProperties(defs, "");

    expect(results).toHaveLength(2);
    expect(results[0].match).toBeNull();
    expect(results[1].match).toBeNull();
  });

  it("finds exact path segment matches", () => {
    const defs = [
      createDef("channels.telegram.token"),
      createDef("channels.discord.token"),
      createDef("settings.general"),
    ];
    const results = searchProperties(defs, "telegram");

    expect(results).toHaveLength(1);
    expect(results[0].def.pathKey).toBe("channels.telegram.token");
    expect(results[0].score).toBe(100); // Exact segment match
  });

  it("finds partial path matches", () => {
    const defs = [createDef("channels.telegram.token"), createDef("settings.general")];
    const results = searchProperties(defs, "tele");

    expect(results).toHaveLength(1);
    expect(results[0].def.pathKey).toBe("channels.telegram.token");
    expect(results[0].score).toBe(50); // Partial match
  });

  it("finds label matches", () => {
    const defs = [createDef("a.b", { label: "API Token" }), createDef("c.d", { label: "Enabled" })];
    const results = searchProperties(defs, "api");

    expect(results).toHaveLength(1);
    expect(results[0].def.pathKey).toBe("a.b");
  });

  it("finds description matches", () => {
    const defs = [
      createDef("a.b", { description: "Authentication token for the API" }),
      createDef("c.d", { description: "Enable this feature" }),
    ];
    const results = searchProperties(defs, "authentication");

    expect(results).toHaveLength(1);
    expect(results[0].def.pathKey).toBe("a.b");
    expect(results[0].match?.inDescription).toBe(true);
  });

  it("handles multiple search terms", () => {
    const defs = [
      createDef("channels.telegram.token"),
      createDef("channels.telegram.enabled"),
      createDef("channels.discord.token"),
    ];
    const results = searchProperties(defs, "telegram token");

    // Both terms should contribute to score
    expect(results).toHaveLength(1);
    expect(results[0].def.pathKey).toBe("channels.telegram.token");
    expect(results[0].score).toBeGreaterThan(100); // Multiple matches
  });

  it("provides highlight ranges", () => {
    const defs = [createDef("channels.telegram.token")];
    const results = searchProperties(defs, "tele");

    expect(results[0].match?.inPath).toBe(true);
    expect(results[0].match?.pathRanges).toHaveLength(1);
    expect(results[0].match?.pathRanges[0]).toEqual([9, 13]); // "tele" in "channels.telegram.token"
  });

  it("sorts by score descending", () => {
    const defs = [
      createDef("a.something"),
      createDef("telegram.config"), // Exact segment match
      createDef("b.telegramish"), // Partial match
    ];
    const results = searchProperties(defs, "telegram");

    expect(results[0].def.pathKey).toBe("telegram.config");
    expect(results[1].def.pathKey).toBe("b.telegramish");
  });
});

describe("filterVisibleResults", () => {
  it("shows root level items always", () => {
    const defs = [createDef("root", { depth: 0 })];
    const results = searchProperties(defs, "");
    const expanded = new Set<string>();

    const visible = filterVisibleResults(results, expanded);

    expect(visible).toHaveLength(1);
  });

  it("hides nested items when parent is collapsed", () => {
    const defs = [
      createDef("parent", { depth: 0, isGroupHeader: true }),
      createDef("parent.child", { depth: 1, parentPath: "parent" }),
    ];
    const results = searchProperties(defs, "");
    const expanded = new Set<string>(); // Nothing expanded

    const visible = filterVisibleResults(results, expanded);

    expect(visible).toHaveLength(1);
    expect(visible[0].def.pathKey).toBe("parent");
  });

  it("shows nested items when parent is expanded", () => {
    const defs = [
      createDef("parent", { depth: 0, isGroupHeader: true }),
      createDef("parent.child", { depth: 1, parentPath: "parent" }),
    ];
    const results = searchProperties(defs, "");
    const expanded = new Set(["parent"]);

    const visible = filterVisibleResults(results, expanded);

    expect(visible).toHaveLength(2);
  });
});

describe("expandParentsForMatches", () => {
  it("expands parent paths for matched items", () => {
    const defs = [createDef("a.b.c.d", { depth: 3 })];
    const results = searchProperties(defs, "d");
    const currentExpanded = new Set<string>();

    const newExpanded = expandParentsForMatches(results, currentExpanded);

    expect(newExpanded.has("a")).toBe(true);
    expect(newExpanded.has("a.b")).toBe(true);
    expect(newExpanded.has("a.b.c")).toBe(true);
  });

  it("preserves existing expanded paths", () => {
    const defs = [createDef("x.y")];
    const results = searchProperties(defs, "y");
    const currentExpanded = new Set(["other.path"]);

    const newExpanded = expandParentsForMatches(results, currentExpanded);

    expect(newExpanded.has("other.path")).toBe(true);
    expect(newExpanded.has("x")).toBe(true);
  });

  it("does nothing for items with no match", () => {
    const defs = [createDef("a.b")];
    const results = searchProperties(defs, ""); // No query = no match
    const currentExpanded = new Set<string>();

    const newExpanded = expandParentsForMatches(results, currentExpanded);

    expect(newExpanded.size).toBe(0);
  });
});

describe("splitByHighlights", () => {
  it("returns single part when no ranges", () => {
    const parts = splitByHighlights("hello world", []);

    expect(parts).toEqual([{ text: "hello world", highlight: false }]);
  });

  it("splits at highlight ranges", () => {
    const parts = splitByHighlights("hello world", [[0, 5]]);

    expect(parts).toEqual([
      { text: "hello", highlight: true },
      { text: " world", highlight: false },
    ]);
  });

  it("handles multiple ranges", () => {
    const parts = splitByHighlights("one two three", [
      [0, 3],
      [8, 13],
    ]);

    expect(parts).toEqual([
      { text: "one", highlight: true },
      { text: " two ", highlight: false },
      { text: "three", highlight: true },
    ]);
  });

  it("handles range at end", () => {
    const parts = splitByHighlights("hello world", [[6, 11]]);

    expect(parts).toEqual([
      { text: "hello ", highlight: false },
      { text: "world", highlight: true },
    ]);
  });
});
