/**
 * Process CRUD handlers - list, get, create, update, delete operations.
 *
 * These handlers provide the core API for managing process descriptors,
 * which represent conversation-derived workflows that can be scheduled,
 * composed, and exposed as external interfaces.
 *
 * @module process/crud
 */

import { TypeCompiler } from "@sinclair/typebox/compiler";
import type { CronSchedule } from "../../../cron/types.js";
import {
  createProcess,
  getProcess,
  updateProcess,
  deleteProcess,
  listProcesses,
  generateProcessId,
  generateTaskId,
} from "../../../process/store.js";
import {
  createEmptyProcessDescriptor,
  createProcessTask,
  createDefaultProcessInterface,
  type ProcessDescriptor,
  type ProcessStatus,
} from "../../../process/types.js";
import {
  ProcessListParamsSchema,
  ProcessGetParamsSchema,
  ProcessCreateParamsSchema,
  ProcessUpdateParamsSchema,
  ProcessDeleteParamsSchema,
  type ProcessListParams,
  type ProcessGetParams,
  type ProcessCreateParams,
  type ProcessUpdateParams,
  type ProcessDeleteParams,
} from "../../protocol/schema/process.js";
import {
  formatErrors,
  resolveAgentId,
  invalidRequestError,
  notFoundError,
  unavailableError,
  type GatewayRequestHandlers,
} from "./shared.js";

// Pre-compile validators for performance (done once at module load)
const validateProcessListParams = TypeCompiler.Compile(ProcessListParamsSchema);
const validateProcessGetParams = TypeCompiler.Compile(ProcessGetParamsSchema);
const validateProcessCreateParams = TypeCompiler.Compile(ProcessCreateParamsSchema);
const validateProcessUpdateParams = TypeCompiler.Compile(ProcessUpdateParamsSchema);
const validateProcessDeleteParams = TypeCompiler.Compile(ProcessDeleteParamsSchema);

/**
 * Maximum number of tasks allowed in a single process.
 * Prevents runaway process definitions.
 */
const MAX_TASKS_PER_PROCESS = 100;

/**
 * Maximum length for process/task names and descriptions.
 */
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * Detect circular dependencies in task definitions.
 *
 * @param tasks - Array of task definitions with label and dependsOn fields
 * @returns True if circular dependency detected, false otherwise
 */
function hasCircularDependency(tasks: Array<{ label: string; dependsOn?: string[] }>): boolean {
  const labelSet = new Set(tasks.map((t) => t.label));
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(label: string): boolean {
    if (inStack.has(label)) return true; // Cycle detected
    if (visited.has(label)) return false; // Already processed

    visited.add(label);
    inStack.add(label);

    const task = tasks.find((t) => t.label === label);
    if (task?.dependsOn) {
      for (const dep of task.dependsOn) {
        if (labelSet.has(dep) && dfs(dep)) {
          return true;
        }
      }
    }

    inStack.delete(label);
    return false;
  }

  for (const task of tasks) {
    if (dfs(task.label)) return true;
  }

  return false;
}

/**
 * Validate task definitions for a process.
 *
 * @param tasks - Array of task definitions
 * @returns Error message if validation fails, undefined otherwise
 */
function validateTasks(
  tasks: Array<{ label: string; description?: string; prompt?: string; dependsOn?: string[] }>,
): string | undefined {
  if (tasks.length > MAX_TASKS_PER_PROCESS) {
    return `too many tasks: ${tasks.length} exceeds maximum of ${MAX_TASKS_PER_PROCESS}`;
  }

  // Check for duplicate labels
  const labels = new Set<string>();
  for (const task of tasks) {
    if (labels.has(task.label)) {
      return `duplicate task label: "${task.label}"`;
    }
    labels.add(task.label);

    // Validate lengths
    if (task.label.length > MAX_NAME_LENGTH) {
      return `task label too long: "${task.label.slice(0, 50)}..."`;
    }
    if (task.description && task.description.length > MAX_DESCRIPTION_LENGTH) {
      return `task description too long for "${task.label}"`;
    }
  }

  // Check for circular dependencies
  if (hasCircularDependency(tasks)) {
    return "circular dependency detected in task dependencies";
  }

  // Check for invalid dependency references
  for (const task of tasks) {
    if (task.dependsOn) {
      for (const dep of task.dependsOn) {
        if (!labels.has(dep)) {
          return `task "${task.label}" depends on unknown task "${dep}"`;
        }
      }
    }
  }

  return undefined;
}

export const processCrudHandlers: GatewayRequestHandlers = {
  /**
   * List processes with optional filters.
   *
   * Supports filtering by status, tags, and text search.
   * Results are sorted by updatedAt descending.
   */
  "process.list": async ({ params, respond }) => {
    if (!validateProcessListParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.list params: ${formatErrors(validateProcessListParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessListParams;
    const agentId = resolveAgentId(p);

    try {
      const processes = await listProcesses(agentId, {
        status: p.status as ProcessStatus[] | undefined,
        tags: p.tags,
        search: p.search,
        limit: p.limit,
      });

      respond(true, {
        ts: Date.now(),
        count: processes.length,
        processes,
      });
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(
          `failed to list processes: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  /**
   * Get a single process by ID.
   */
  "process.get": async ({ params, respond }) => {
    if (!validateProcessGetParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.get params: ${formatErrors(validateProcessGetParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessGetParams;
    const agentId = resolveAgentId(p);

    try {
      const process = await getProcess(agentId, p.id);
      if (!process) {
        respond(false, undefined, notFoundError(`process not found: ${p.id}`));
        return;
      }

      respond(true, process);
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(
          `failed to get process: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  /**
   * Create a new process.
   *
   * Validates task definitions for circular dependencies and duplicate labels.
   * Sets initial status to 'active' if tasks are provided, 'draft' otherwise.
   */
  "process.create": async ({ params, respond }) => {
    if (!validateProcessCreateParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.create params: ${formatErrors(validateProcessCreateParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessCreateParams;
    const agentId = resolveAgentId(p);

    // Validate name length
    if (p.name.length > MAX_NAME_LENGTH) {
      respond(
        false,
        undefined,
        invalidRequestError(`process name too long: maximum ${MAX_NAME_LENGTH} characters`),
      );
      return;
    }

    // Validate description length
    if (p.description && p.description.length > MAX_DESCRIPTION_LENGTH) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `process description too long: maximum ${MAX_DESCRIPTION_LENGTH} characters`,
        ),
      );
      return;
    }

    // Validate tasks if provided
    if (p.tasks && p.tasks.length > 0) {
      const taskError = validateTasks(p.tasks);
      if (taskError) {
        respond(false, undefined, invalidRequestError(taskError));
        return;
      }
    }

    const processId = generateProcessId();

    try {
      // Create base process
      const baseProcess = createEmptyProcessDescriptor({
        id: processId,
        name: p.name,
        agentId,
        createdFromSessionKey: p.sessionKey,
      });

      // Apply optional fields
      if (p.description) {
        baseProcess.description = p.description;
      }

      if (p.tags) {
        baseProcess.tags = p.tags;
      }

      // Create tasks from input
      if (p.tasks && p.tasks.length > 0) {
        const taskMap = new Map<string, string>(); // label -> id for dependency resolution

        baseProcess.tasks = p.tasks.map((t, index) => {
          const taskId = generateTaskId();
          taskMap.set(t.label, taskId);

          // Resolve dependsOn labels to task IDs
          const dependsOn = t.dependsOn
            ?.map((dep) => taskMap.get(dep))
            .filter((id): id is string => id !== undefined);

          return createProcessTask({
            id: taskId,
            label: t.label,
            order: index,
            prompt: t.prompt,
            dependsOn: dependsOn?.length ? dependsOn : undefined,
          });
        });
      }

      // Apply schedule if provided
      if (p.schedule) {
        baseProcess.schedule = {
          mode: p.schedule.mode as "manual" | "once" | "recurring" | "event-driven",
          cronSchedule: p.schedule.cronSchedule as CronSchedule | undefined,
          runAtMs: p.schedule.runAtMs,
          triggerEvents: p.schedule.triggerEvents,
          timezone: p.schedule.timezone,
        };
      }

      // Apply interface customization
      if (p.interface) {
        const defaultInterface = createDefaultProcessInterface();
        baseProcess.interface = {
          ...defaultInterface,
          ...p.interface,
          viewKind:
            (p.interface.viewKind as ProcessDescriptor["interface"]["viewKind"]) ??
            defaultInterface.viewKind,
          actions:
            (p.interface.actions as ProcessDescriptor["interface"]["actions"]) ??
            defaultInterface.actions,
        };
      }

      // Apply inputs/outputs
      if (p.inputs) {
        baseProcess.inputs = p.inputs as ProcessDescriptor["inputs"];
      }
      if (p.outputs) {
        baseProcess.outputs = p.outputs as ProcessDescriptor["outputs"];
      }

      // Set initial status based on whether tasks exist
      baseProcess.status = baseProcess.tasks.length > 0 ? "active" : "draft";

      // Save to store
      const created = await createProcess(agentId, baseProcess);

      respond(true, created);
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(
          `failed to create process: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  /**
   * Update an existing process.
   *
   * Only allowed fields in the patch are applied.
   * ID, createdAt, and agentId cannot be modified.
   */
  "process.update": async ({ params, respond }) => {
    if (!validateProcessUpdateParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.update params: ${formatErrors(validateProcessUpdateParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessUpdateParams;
    const agentId = resolveAgentId(p);

    try {
      const updated = await updateProcess(agentId, p.id, p.patch as Partial<ProcessDescriptor>);
      if (!updated) {
        respond(false, undefined, notFoundError(`process not found: ${p.id}`));
        return;
      }

      respond(true, updated);
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(
          `failed to update process: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  /**
   * Delete a process.
   *
   * This is a hard delete; the process cannot be recovered.
   * Consider using status 'archived' for soft deletion.
   */
  "process.delete": async ({ params, respond }) => {
    if (!validateProcessDeleteParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.delete params: ${formatErrors(validateProcessDeleteParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessDeleteParams;
    const agentId = resolveAgentId(p);

    try {
      const deleted = await deleteProcess(agentId, p.id);
      if (!deleted) {
        respond(false, undefined, notFoundError(`process not found: ${p.id}`));
        return;
      }

      respond(true, { ok: true, id: p.id });
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(
          `failed to delete process: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },
};
