/**
 * Process Gateway Handlers - API methods for process management.
 *
 * This module provides the complete API for managing processes (conversation-derived
 * workflows) via the gateway protocol. Processes allow conversations to become
 * reusable, composable workflows with external visibility.
 *
 * ## Handler Groups
 *
 * - **CRUD** (`crud.ts`): List, get, create, update, delete processes
 * - **Tasks** (`tasks.ts`): Add, update, remove, reorder, run individual tasks
 * - **Lifecycle** (`lifecycle.ts`): Run all ready tasks, pause, resume processes
 *
 * ## Available Methods
 *
 * ### Process CRUD
 * - `process.list` - List processes with filters
 * - `process.get` - Get a single process by ID
 * - `process.create` - Create a new process
 * - `process.update` - Update an existing process
 * - `process.delete` - Delete a process
 *
 * ### Task Management
 * - `process.task.add` - Add a new task to a process
 * - `process.task.update` - Update a task's properties
 * - `process.task.remove` - Remove a task from a process
 * - `process.task.reorder` - Reorder tasks within a process
 * - `process.task.run` - Run a specific task
 *
 * ### Lifecycle Management
 * - `process.run` - Run all ready tasks in a process
 * - `process.pause` - Pause a process
 * - `process.resume` - Resume a paused process
 *
 * @module process
 */

import type { GatewayRequestHandlers } from "../types.js";
import { processCrudHandlers } from "./crud.js";
import { processLifecycleHandlers } from "./lifecycle.js";
import { processTaskHandlers } from "./tasks.js";

/**
 * Combined process handlers for gateway registration.
 *
 * Aggregates all process-related handlers from:
 * - CRUD operations
 * - Task management
 * - Lifecycle management
 */
export const processHandlers: GatewayRequestHandlers = {
  ...processCrudHandlers,
  ...processTaskHandlers,
  ...processLifecycleHandlers,
};

// Re-export individual handler groups for testing and selective import
export { processCrudHandlers } from "./crud.js";
export { processTaskHandlers } from "./tasks.js";
export { processLifecycleHandlers } from "./lifecycle.js";
