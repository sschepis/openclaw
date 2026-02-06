/**
 * Tests for schema flattening utilities
 */

import { describe, it, expect } from "vitest";
import {
  flattenSchema,
  schemaType,
  defaultValue,
  pathKey,
  hintForPath,
  humanize,
  isSensitivePath,
  getValueAtPath,
  valuesAreDifferent,
} from "./flatten";
import type { JsonSchema } from "../types";

describe("schemaType", () => {
  it("returns undefined for empty schema", () => {
    expect(schemaType({})).toBeUndefined();
  });

  it("returns string type", () => {
    expect(schemaType({ type: "string" })).toBe("string");
  });

  it("handles array types, filtering null", () => {
    expect(schemaType({ type: ["string", "null"] })).toBe("string");
  });

  it("returns first non-null type from array", () => {
    expect(schemaType({ type: ["null", "number"] })).toBe("number");
  });
});

describe("defaultValue", () => {
  it("returns schema default if present", () => {
    expect(defaultValue({ type: "string", default: "hello" })).toBe("hello");
  });

  it("returns empty string for string type", () => {
    expect(defaultValue({ type: "string" })).toBe("");
  });

  it("returns 0 for number type", () => {
    expect(defaultValue({ type: "number" })).toBe(0);
  });

  it("returns false for boolean type", () => {
    expect(defaultValue({ type: "boolean" })).toBe(false);
  });

  it("returns empty array for array type", () => {
    expect(defaultValue({ type: "array" })).toEqual([]);
  });

  it("returns empty object for object type", () => {
    expect(defaultValue({ type: "object" })).toEqual({});
  });
});

describe("pathKey", () => {
  it("joins string segments with dots", () => {
    expect(pathKey(["a", "b", "c"])).toBe("a.b.c");
  });

  it("filters out numeric segments", () => {
    expect(pathKey(["items", 0, "name"])).toBe("items.name");
  });

  it("returns empty string for empty path", () => {
    expect(pathKey([])).toBe("");
  });
});

describe("hintForPath", () => {
  it("returns direct match", () => {
    const hints = { "foo.bar": { label: "Test" } };
    expect(hintForPath(["foo", "bar"], hints)).toEqual({ label: "Test" });
  });

  it("returns undefined for no match", () => {
    const hints = { "foo.bar": { label: "Test" } };
    expect(hintForPath(["foo", "baz"], hints)).toBeUndefined();
  });

  it("supports wildcard patterns", () => {
    const hints = { "items.*.name": { label: "Item Name" } };
    expect(hintForPath(["items", "something", "name"], hints)).toEqual({
      label: "Item Name",
    });
  });
});

describe("humanize", () => {
  it("converts snake_case to Title Case", () => {
    expect(humanize("my_setting")).toBe("My setting");
  });

  it("splits camelCase", () => {
    expect(humanize("mySetting")).toBe("My Setting");
  });

  it("handles mixed case", () => {
    expect(humanize("my_settingName")).toBe("My setting Name");
  });
});

describe("isSensitivePath", () => {
  it("detects token paths", () => {
    expect(isSensitivePath(["channels", "telegram", "token"])).toBe(true);
  });

  it("detects password paths", () => {
    expect(isSensitivePath(["auth", "password"])).toBe(true);
  });

  it("detects apiKey paths", () => {
    expect(isSensitivePath(["services", "openaiApiKey"])).toBe(true);
  });

  it("returns false for normal paths", () => {
    expect(isSensitivePath(["channels", "telegram", "enabled"])).toBe(false);
  });
});

describe("getValueAtPath", () => {
  it("gets nested value", () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getValueAtPath(obj, ["a", "b", "c"])).toBe(42);
  });

  it("returns undefined for missing path", () => {
    const obj = { a: { b: 1 } };
    expect(getValueAtPath(obj, ["a", "c"])).toBeUndefined();
  });

  it("returns undefined for null in path", () => {
    const obj = { a: null };
    expect(getValueAtPath(obj, ["a", "b"])).toBeUndefined();
  });
});

describe("valuesAreDifferent", () => {
  it("returns false for equal primitives", () => {
    expect(valuesAreDifferent("a", "a")).toBe(false);
    expect(valuesAreDifferent(42, 42)).toBe(false);
    expect(valuesAreDifferent(true, true)).toBe(false);
  });

  it("returns true for different primitives", () => {
    expect(valuesAreDifferent("a", "b")).toBe(true);
    expect(valuesAreDifferent(1, 2)).toBe(true);
  });

  it("handles null/undefined", () => {
    expect(valuesAreDifferent(null, null)).toBe(false);
    expect(valuesAreDifferent(undefined, undefined)).toBe(false);
    expect(valuesAreDifferent(null, undefined)).toBe(false);
    expect(valuesAreDifferent(null, "a")).toBe(true);
  });

  it("compares objects deeply", () => {
    expect(valuesAreDifferent({ a: 1 }, { a: 1 })).toBe(false);
    expect(valuesAreDifferent({ a: 1 }, { a: 2 })).toBe(true);
  });

  it("compares arrays deeply", () => {
    expect(valuesAreDifferent([1, 2], [1, 2])).toBe(false);
    expect(valuesAreDifferent([1, 2], [1, 3])).toBe(true);
  });
});

describe("flattenSchema", () => {
  it("flattens simple object schema", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        name: { type: "string", title: "Name" },
        age: { type: "number", title: "Age" },
      },
    };
    const value = { name: "Test", age: 25 };

    const result = flattenSchema(schema, value, {});

    expect(result.definitions).toHaveLength(2);
    expect(result.definitions[0].pathKey).toBe("age"); // sorted alphabetically
    expect(result.definitions[1].pathKey).toBe("name");
  });

  it("creates group headers for nested objects", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        channels: {
          type: "object",
          title: "Channels",
          properties: {
            enabled: { type: "boolean" },
          },
        },
      },
    };
    const value = { channels: { enabled: true } };
    const expanded = new Set(["channels"]);

    const result = flattenSchema(schema, value, {}, [], 0, expanded);

    expect(result.definitions).toHaveLength(2);
    expect(result.definitions[0].isGroupHeader).toBe(true);
    expect(result.definitions[0].pathKey).toBe("channels");
    expect(result.definitions[1].pathKey).toBe("channels.enabled");
  });

  it("respects collapsed state", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        channels: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
          },
        },
      },
    };
    const value = { channels: { enabled: true } };
    const expanded = new Set<string>(); // Nothing expanded

    const result = flattenSchema(schema, value, {}, [], 0, expanded);

    // Only the header, children are hidden
    expect(result.definitions).toHaveLength(1);
    expect(result.definitions[0].isGroupHeader).toBe(true);
    expect(result.definitions[0].isExpanded).toBe(false);
  });

  it("respects UI hint ordering", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        zeta: { type: "string" },
        alpha: { type: "string" },
        beta: { type: "string" },
      },
    };
    const hints = {
      zeta: { order: 1 },
      alpha: { order: 3 },
      beta: { order: 2 },
    };

    const result = flattenSchema(schema, {}, hints);

    expect(result.definitions.map((d) => d.pathKey)).toEqual([
      "zeta",
      "beta",
      "alpha",
    ]);
  });

  it("handles enum types", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["a", "b", "c"] },
      },
    };

    const result = flattenSchema(schema, {}, {});

    expect(result.definitions[0].type).toBe("enum");
    expect(result.definitions[0].enumValues).toEqual(["a", "b", "c"]);
  });

  it("handles anyOf with literals as enum", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        level: {
          anyOf: [{ const: "low" }, { const: "medium" }, { const: "high" }],
        },
      },
    };

    const result = flattenSchema(schema, {}, {});

    expect(result.definitions[0].type).toBe("enum");
    expect(result.definitions[0].enumValues).toEqual(["low", "medium", "high"]);
  });

  it("marks sensitive paths", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        token: { type: "string" },
        name: { type: "string" },
      },
    };

    const result = flattenSchema(schema, {}, {});

    const tokenDef = result.definitions.find((d) => d.pathKey === "token");
    const nameDef = result.definitions.find((d) => d.pathKey === "name");

    expect(tokenDef?.sensitive).toBe(true);
    expect(nameDef?.sensitive).toBe(false);
  });
});
