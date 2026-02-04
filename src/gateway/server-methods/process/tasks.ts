/**
 * Process Task handlers - add, update, remove, reorder, run task operations.
 *
 * These handlers manage individual tasks within a process, including
 * status updates, reordering, and triggering task execution.
 *
 * @module process/tasks
 */

import { TypeCompiler } from "@sinclair/typebox/compiler";
import {
  getProcess,
  addProcessTask,
  updateProcessTask,
  removeProcessTask,
  reorderProcessTasks,
  setTaskStatus,
  generateTaskId,
} from "../../../process/store.js";
import { createProcessTask, type ProcessTask } from "../../../process/types.js";
import {
  ProcessTaskUpdateParamsSchema,
  ProcessTaskAddParamsSchema,
  ProcessTaskRemoveParamsSchema,
  ProcessTaskReorderParamsSchema,
  ProcessTaskRunParamsSchema,
  type ProcessTaskUpdateParams,
  type ProcessTaskAddParams,
  type ProcessTaskRemoveParams,
  type ProcessTaskReorderParams,
  type ProcessTaskRunParams,
} from "../../protocol/schema/process.js";
import {
  formatErrors,
  resolveAgentId,
  invalidRequestError,
  notFoundError,
  unavailableError,
  type GatewayRequestHandlers,
} from "./shared.js";

// Pre-compile validators for performance
const validateProcessTaskUpdateParams = TypeCompiler.Compile(ProcessTaskUpdateParamsSchema);
const validateProcessTaskAddParams = TypeCompiler.Compile(ProcessTaskAddParamsSchema);
const validateProcessTaskRemoveParams = TypeCompiler.Compile(ProcessTaskRemoveParamsSchema);
const validateProcessTaskReorderParams = TypeCompiler.Compile(ProcessTaskReorderParamsSchema);
const validateProcessTaskRunParams = TypeCompiler.Compile(ProcessTaskRunParamsSchema);

/**
 * Maximum length for task labels and descriptions.
 */
const MAX_LABEL_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * Maximum number of tasks per process (for add operation validation).
 */
const MAX_TASKS_PER_PROCESS = 100;

/**
 * Validate that adding a task won't create a circular dependency.
 *
 * @param existingTasks - Current tasks in the process
 * @param newTask - Task being added with potential dependencies
 * @returns Error message if circular dependency would be created, undefined otherwise
 */
function validateNewTaskDependencies(
  existingTasks: ProcessTask[],
  newTask: { dependsOn?: string[] },
): string | undefined {
  if (!newTask.dependsOn || newTask.dependsOn.length === 0) {
    return undefined;
  }

  const existingIds = new Set(existingTasks.map((t) => t.id));

  for (const depId of newTask.dependsOn) {
    if (!existingIds.has(depId)) {
      return `dependency not found: ${depId}`;
    }
  }

  return undefined;
}

export const processTaskHandlers: GatewayRequestHandlers = {
  /**
   * Update a task within a process.
   *
   * Allows updating label, description, status, prompt, and result.
   * Task ID and order cannot be modified via this endpoint.
   */
  "process.task.update": async ({ params, respond }) => {
    if (!validateProcessTaskUpdateParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.task.update params: ${formatErrors(validateProcessTaskUpdateParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessTaskUpdateParams;
    const agentId = resolveAgentId(p);

    try {
      // Validate label length if provided
      if (p.patch.label && p.patch.label.length > MAX_LABEL_LENGTH) {
        respond(
          false,
          undefined,
          invalidRequestError(`task label too long: maximum ${MAX_LABEL_LENGTH} characters`),
        );
        return;
      }

      // Validate description length if provided
      if (p.patch.description && p.patch.description.length > MAX_DESCRIPTION_LENGTH) {
        respond(
          false,
          undefined,
          invalidRequestError(
            `task description too long: maximum ${MAX_DESCRIPTION_LENGTH} characters`,
          ),
        );
        return;
      }

      const updated = await updateProcessTask(
        agentId,
        p.processId,
        p.taskId,
        p.patch as Partial<ProcessTask>,
      );

      if (!updated) {
        respond(
          false,
          undefined,
          notFoundError(`task not found: ${p.taskId} in process ${p.processId}`),
        );
        return;
      }

      respond(true, updated);
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(
          `failed to update task: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  /**
   * Add a new task to a process.
   *
   * Supports inserting after a specific task via insertAfter field.
   * Validates that the process exists and hasn't exceeded max tasks.
   */
  "process.task.add": async ({ params, respond }) => {
    if (!validateProcessTaskAddParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.task.add params: ${formatErrors(validateProcessTaskAddParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessTaskAddParams;
    const agentId = resolveAgentId(p);

    // Validate label length
    if (p.task.label.length > MAX_LABEL_LENGTH) {
      respond(
        false,
        undefined,
        invalidRequestError(`task label too long: maximum ${MAX_LABEL_LENGTH} characters`),
      );
      return;
    }

    // Validate description length if provided
    if (p.task.description && p.task.description.length > MAX_DESCRIPTION_LENGTH) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `task description too long: maximum ${MAX_DESCRIPTION_LENGTH} characters`,
        ),
      );
      return;
    }

    try {
      const process = await getProcess(agentId, p.processId);
      if (!process) {
        respond(false, undefined, notFoundError(`process not found: ${p.processId}`));
        return;
      }

      // Check max tasks limit
      if (process.tasks.length >= MAX_TASKS_PER_PROCESS) {
        respond(
          false,
          undefined,
          invalidRequestError(`process has maximum number of tasks (${MAX_TASKS_PER_PROCESS})`),
        );
        return;
      }

      // Check for duplicate label
      if (process.tasks.some((t) => t.label === p.task.label)) {
        respond(false, undefined, invalidRequestError(`duplicate task label: "${p.task.label}"`));
        return;
      }

      // Validate dependencies
      if (p.task.dependsOn && p.task.dependsOn.length > 0) {
        const depError = validateNewTaskDependencies(process.tasks, {
          dependsOn: p.task.dependsOn,
        });
        if (depError) {
          respond(false, undefined, invalidRequestError(depError));
          return;
        }
      }

      // Determine order
      let order = process.tasks.length;
      if (p.task.insertAfter) {
        const insertAfterIndex = process.tasks.findIndex((t) => t.id === p.task.insertAfter);
        if (insertAfterIndex >= 0) {
          order = insertAfterIndex + 1;
        } else {
          respond(
            false,
            undefined,
            invalidRequestError(`insertAfter task not found: ${p.task.insertAfter}`),
          );
          return;
        }
      }

      const task = createProcessTask({
        id: generateTaskId(),
        label: p.task.label,
        order,
        prompt: p.task.prompt,
        dependsOn: p.task.dependsOn,
      });

      if (p.task.description) {
        task.description = p.task.description;
      }

      const added = await addProcessTask(agentId, p.processId, task);
      if (!added) {
        respond(false, undefined, unavailableError(`failed to add task to process`));
        return;
      }

      respond(true, added);
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(`failed to add task: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  },

  /**
   * Remove a task from a process.
   *
   * Note: This does not automatically update dependencies in other tasks.
   * Dependent tasks should be updated separately.
   */
  "process.task.remove": async ({ params, respond }) => {
    if (!validateProcessTaskRemoveParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.task.remove params: ${formatErrors(validateProcessTaskRemoveParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessTaskRemoveParams;
    const agentId = resolveAgentId(p);

    try {
      // Check if task is a dependency of other tasks
      const process = await getProcess(agentId, p.processId);
      if (process) {
        const dependentTasks = process.tasks.filter((t) => t.dependsOn?.includes(p.taskId));
        if (dependentTasks.length > 0) {
          const labels = dependentTasks.map((t) => t.label).join(", ");
          respond(
            false,
            undefined,
            invalidRequestError(`cannot remove task: it is a dependency of: ${labels}`),
          );
          return;
        }
      }

      const removed = await removeProcessTask(agentId, p.processId, p.taskId);
      if (!removed) {
        respond(
          false,
          undefined,
          notFoundError(`task not found: ${p.taskId} in process ${p.processId}`),
        );
        return;
      }

      respond(true, { ok: true, taskId: p.taskId });
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(
          `failed to remove task: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  /**
   * Reorder tasks within a process.
   *
   * Accepts an array of task IDs in the desired order.
   * All existing task IDs must be included.
   */
  "process.task.reorder": async ({ params, respond }) => {
    if (!validateProcessTaskReorderParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.task.reorder params: ${formatErrors(validateProcessTaskReorderParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessTaskReorderParams;
    const agentId = resolveAgentId(p);

    try {
      // Validate that all task IDs exist
      const process = await getProcess(agentId, p.processId);
      if (!process) {
        respond(false, undefined, notFoundError(`process not found: ${p.processId}`));
        return;
      }

      const existingIds = new Set(process.tasks.map((t) => t.id));
      const providedIds = new Set(p.taskIds);

      // Check for unknown IDs
      for (const id of p.taskIds) {
        if (!existingIds.has(id)) {
          respond(false, undefined, invalidRequestError(`unknown task ID: ${id}`));
          return;
        }
      }

      // Check for missing IDs
      for (const id of existingIds) {
        if (!providedIds.has(id)) {
          respond(false, undefined, invalidRequestError(`missing task ID in reorder list: ${id}`));
          return;
        }
      }

      const reordered = await reorderProcessTasks(agentId, p.processId, p.taskIds);
      if (!reordered) {
        respond(false, undefined, unavailableError(`failed to reorder tasks`));
        return;
      }

      const updated = await getProcess(agentId, p.processId);
      respond(true, updated);
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(
          `failed to reorder tasks: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  /**
   * Run a specific task.
   *
   * This marks the task as in-progress but does not actually execute it.
   * Task execution is handled by the agent via system events or cron jobs.
   * The task's prompt will be sent to the agent for processing.
   */
  "process.task.run": async ({ params, respond }) => {
    if (!validateProcessTaskRunParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.task.run params: ${formatErrors(validateProcessTaskRunParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessTaskRunParams;
    const agentId = resolveAgentId(p);

    try {
      const process = await getProcess(agentId, p.processId);
      if (!process) {
        respond(false, undefined, notFoundError(`process not found: ${p.processId}`));
        return;
      }

      // Check process status
      if (process.status === "paused") {
        respond(false, undefined, invalidRequestError(`cannot run task: process is paused`));
        return;
      }

      if (process.status === "completed" || process.status === "archived") {
        respond(
          false,
          undefined,
          invalidRequestError(`cannot run task: process is ${process.status}`),
        );
        return;
      }

      const task = process.tasks.find((t) => t.id === p.taskId);
      if (!task) {
        respond(
          false,
          undefined,
          notFoundError(`task not found: ${p.taskId} in process ${p.processId}`),
        );
        return;
      }

      // Check if task can be run
      if (task.status === "in-progress") {
        respond(false, undefined, invalidRequestError(`task is already in progress`));
        return;
      }

      if (task.status === "completed") {
        respond(false, undefined, invalidRequestError(`task is already completed`));
        return;
      }

      // Check dependencies are satisfied
      if (task.dependsOn && task.dependsOn.length > 0) {
        const incompleteDeps = task.dependsOn.filter((depId) => {
          const depTask = process.tasks.find((t) => t.id === depId);
          return depTask?.status !== "completed";
        });

        if (incompleteDeps.length > 0) {
          const depLabels = incompleteDeps
            .map((id) => process.tasks.find((t) => t.id === id)?.label ?? id)
            .join(", ");
          respond(
            false,
            undefined,
            invalidRequestError(`cannot run task: waiting on dependencies: ${depLabels}`),
          );
          return;
        }
      }

      // Mark task as in-progress
      await setTaskStatus(agentId, p.processId, p.taskId, "in-progress");

      // Task execution is triggered externally via cron/system events
      // The gateway only updates task status here

      respond(true, {
        ok: true,
        taskId: p.taskId,
        status: "in-progress",
        prompt: task.prompt,
      });
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(`failed to run task: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  },
};
