/**
 * Shared utilities for process gateway handlers.
 *
 * This module provides common functions used across all process-related
 * gateway handlers including validation error formatting, agent ID resolution,
 * and standardized error response generation.
 *
 * @module process/shared
 */

import type { ValueError } from "@sinclair/typebox/compiler";
import type { GatewayRequestHandlers } from "../types.js";
import { normalizeAgentId, DEFAULT_AGENT_ID } from "../../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../../protocol/schema/error-codes.js";

/**
 * Maximum number of validation errors to include in error messages.
 * Prevents overly verbose error responses for malformed requests.
 */
const MAX_VALIDATION_ERRORS = 5;

/**
 * Format TypeBox validation errors into a human-readable string.
 *
 * @param errors - Iterable of validation errors from TypeBox
 * @returns A semicolon-separated string of error messages, limited to MAX_VALIDATION_ERRORS
 *
 * @example
 * ```ts
 * const errors = validator.Errors(params);
 * const message = formatErrors(errors);
 * // "/name: Required property"
 * ```
 */
export function formatErrors(errors: Iterable<ValueError>): string {
  const messages: string[] = [];
  let count = 0;

  for (const error of errors) {
    if (count >= MAX_VALIDATION_ERRORS) {
      messages.push(`... and more errors`);
      break;
    }
    messages.push(`${error.path}: ${error.message}`);
    count++;
  }

  return messages.join("; ") || "validation failed";
}

/**
 * Resolve agent ID from request params, defaulting to DEFAULT_AGENT_ID if not provided.
 *
 * @param params - Object containing optional agentId field
 * @returns Normalized agent ID string
 */
export function resolveAgentId(params: { agentId?: string }): string {
  return normalizeAgentId(params.agentId ?? DEFAULT_AGENT_ID);
}

/**
 * Create a standardized error response for invalid request parameters.
 *
 * @param message - Error message describing what was invalid
 * @returns Error shape object for gateway response
 */
export function invalidRequestError(message: string) {
  return errorShape(ErrorCodes.INVALID_REQUEST, message);
}

/**
 * Create a standardized error response for resource not found.
 *
 * Note: Uses INVALID_REQUEST code since NOT_FOUND is not available in ErrorCodes.
 * The error message should clearly indicate the resource was not found.
 *
 * @param message - Error message describing what was not found
 * @returns Error shape object for gateway response
 */
export function notFoundError(message: string) {
  return errorShape(ErrorCodes.INVALID_REQUEST, message);
}

/**
 * Create a standardized error response for unavailable/internal errors.
 *
 * @param message - Error message describing the failure
 * @returns Error shape object for gateway response
 */
export function unavailableError(message: string) {
  return errorShape(ErrorCodes.UNAVAILABLE, message);
}

// Re-export common types and functions for convenience
export { ErrorCodes, errorShape };
export type { GatewayRequestHandlers };
