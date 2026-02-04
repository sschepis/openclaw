/**
 * Process Gateway Handlers - API methods for process management.
 *
 * This module aggregates all process-related handlers:
 * - CRUD: list, get, create, update, delete
 * - Tasks: add, update, remove, reorder, run
 * - Lifecycle: run, pause, resume
 */

import type { GatewayRequestHandlers } from "../types.js";
import { processCrudHandlers } from "./crud.js";
import { processLifecycleHandlers } from "./lifecycle.js";
import { processTaskHandlers } from "./tasks.js";

/**
 * Combined process handlers.
 */
export const processHandlers: GatewayRequestHandlers = {
  ...processCrudHandlers,
  ...processTaskHandlers,
  ...processLifecycleHandlers,
};

// Re-export individual handler groups for testing
export { processCrudHandlers } from "./crud.js";
export { processTaskHandlers } from "./tasks.js";
export { processLifecycleHandlers } from "./lifecycle.js";
