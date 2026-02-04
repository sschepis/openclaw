/**
 * Tests for process gateway shared utilities.
 */

import type { ValueError } from "@sinclair/typebox/compiler";
import { describe, it, expect } from "vitest";
import {
  formatErrors,
  resolveAgentId,
  invalidRequestError,
  notFoundError,
  unavailableError,
  ErrorCodes,
} from "./shared.js";

describe("formatErrors", () => {
  it("formats a single error correctly", () => {
    const errors: ValueError[] = [
      {
        type: 50,
        schema: { type: "string" },
        path: "/name",
        value: undefined,
        message: "Expected string",
      },
    ];

    const result = formatErrors(errors);
    expect(result).toBe("/name: Expected string");
  });

  it("formats multiple errors with semicolon separator", () => {
    const errors: ValueError[] = [
      {
        type: 50,
        schema: { type: "string" },
        path: "/name",
        value: undefined,
        message: "Required",
      },
      {
        type: 50,
        schema: { type: "number" },
        path: "/age",
        value: "abc",
        message: "Expected number",
      },
    ];

    const result = formatErrors(errors);
    expect(result).toBe("/name: Required; /age: Expected number");
  });

  it("returns default message for empty errors", () => {
    const result = formatErrors([]);
    expect(result).toBe("validation failed");
  });

  it("truncates errors beyond MAX_VALIDATION_ERRORS", () => {
    const errors: ValueError[] = Array.from({ length: 10 }, (_, i) => ({
      type: 50,
      schema: { type: "string" },
      path: `/field${i}`,
      value: undefined,
      message: `Error ${i}`,
    }));

    const result = formatErrors(errors);
    expect(result).toContain("... and more errors");
    // Should have 5 actual errors + "and more" message
    expect(result.split(";").length).toBe(6);
  });
});

describe("resolveAgentId", () => {
  it("returns provided agentId when specified", () => {
    const result = resolveAgentId({ agentId: "custom-agent" });
    expect(result).toBe("custom-agent");
  });

  it("returns default agent ID when not specified", () => {
    const result = resolveAgentId({});
    expect(result).toBe("main"); // DEFAULT_AGENT_ID
  });

  it("returns default agent ID for undefined", () => {
    const result = resolveAgentId({ agentId: undefined });
    expect(result).toBe("main");
  });
});

describe("error shape helpers", () => {
  it("invalidRequestError returns correct error shape", () => {
    const error = invalidRequestError("test message");
    expect(error).toEqual({
      code: ErrorCodes.INVALID_REQUEST,
      message: "test message",
    });
  });

  it("notFoundError returns INVALID_REQUEST code", () => {
    const error = notFoundError("not found message");
    expect(error).toEqual({
      code: ErrorCodes.INVALID_REQUEST,
      message: "not found message",
    });
  });

  it("unavailableError returns correct error shape", () => {
    const error = unavailableError("service unavailable");
    expect(error).toEqual({
      code: ErrorCodes.UNAVAILABLE,
      message: "service unavailable",
    });
  });
});
