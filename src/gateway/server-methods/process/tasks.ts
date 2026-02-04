/**
 * Process Task handlers - add, update, remove, reorder, run task operations.
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

// Validators
const validateProcessTaskUpdateParams = TypeCompiler.Compile(ProcessTaskUpdateParamsSchema);
const validateProcessTaskAddParams = TypeCompiler.Compile(ProcessTaskAddParamsSchema);
const validateProcessTaskRemoveParams = TypeCompiler.Compile(ProcessTaskRemoveParamsSchema);
const validateProcessTaskReorderParams = TypeCompiler.Compile(ProcessTaskReorderParamsSchema);
const validateProcessTaskRunParams = TypeCompiler.Compile(ProcessTaskRunParamsSchema);

export const processTaskHandlers: GatewayRequestHandlers = {
  /**
   * Update a task within a process.
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
      const updated = await updateProcessTask(
        agentId,
        p.processId,
        p.taskId,
        p.patch as Partial<ProcessTask>,
      );
      if (!updated) {
        respond(false, undefined, notFoundError(`task not found: ${p.taskId}`));
        return;
      }

      respond(true, updated);
    } catch (err) {
      respond(false, undefined, unavailableError(`failed to update task: ${String(err)}`));
    }
  },

  /**
   * Add a new task to a process.
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

    try {
      const process = await getProcess(agentId, p.processId);
      if (!process) {
        respond(false, undefined, notFoundError(`process not found: ${p.processId}`));
        return;
      }

      // Determine order
      let order = process.tasks.length;
      if (p.task.insertAfter) {
        const insertAfterIndex = process.tasks.findIndex((t) => t.id === p.task.insertAfter);
        if (insertAfterIndex >= 0) {
          order = insertAfterIndex + 1;
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
        respond(false, undefined, unavailableError(`failed to add task`));
        return;
      }

      respond(true, added);
    } catch (err) {
      respond(false, undefined, unavailableError(`failed to add task: ${String(err)}`));
    }
  },

  /**
   * Remove a task from a process.
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
      const removed = await removeProcessTask(agentId, p.processId, p.taskId);
      if (!removed) {
        respond(false, undefined, notFoundError(`task not found: ${p.taskId}`));
        return;
      }

      respond(true, { ok: true, taskId: p.taskId });
    } catch (err) {
      respond(false, undefined, unavailableError(`failed to remove task: ${String(err)}`));
    }
  },

  /**
   * Reorder tasks within a process.
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
      const reordered = await reorderProcessTasks(agentId, p.processId, p.taskIds);
      if (!reordered) {
        respond(false, undefined, notFoundError(`process not found: ${p.processId}`));
        return;
      }

      const updated = await getProcess(agentId, p.processId);
      respond(true, updated);
    } catch (err) {
      respond(false, undefined, unavailableError(`failed to reorder tasks: ${String(err)}`));
    }
  },

  /**
   * Run a specific task.
   *
   * Note: This marks the task as in-progress but does not actually execute it.
   * Task execution is handled by the agent via system events or cron jobs.
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

      const task = process.tasks.find((t) => t.id === p.taskId);
      if (!task) {
        respond(false, undefined, notFoundError(`task not found: ${p.taskId}`));
        return;
      }

      // Mark task as in-progress
      await setTaskStatus(agentId, p.processId, p.taskId, "in-progress");

      // Note: Task execution is triggered externally via cron/system events
      // The gateway only updates task status here

      respond(true, { ok: true, taskId: p.taskId, status: "in-progress" });
    } catch (err) {
      respond(false, undefined, unavailableError(`failed to run task: ${String(err)}`));
    }
  },
};
