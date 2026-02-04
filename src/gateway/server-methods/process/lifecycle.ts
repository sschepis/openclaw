/**
 * Process Lifecycle handlers - run, pause, resume operations.
 */

import { TypeCompiler } from "@sinclair/typebox/compiler";
import type { ProcessStatus } from "../../../process/types.js";
import {
  getProcess,
  setProcessStatus,
  setTaskStatus,
  getReadyTasks,
  isProcessComplete,
  hasFailedTasks,
} from "../../../process/store.js";
import {
  ProcessRunParamsSchema,
  ProcessPauseParamsSchema,
  ProcessResumeParamsSchema,
  type ProcessRunParams,
  type ProcessPauseParams,
  type ProcessResumeParams,
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
const validateProcessRunParams = TypeCompiler.Compile(ProcessRunParamsSchema);
const validateProcessPauseParams = TypeCompiler.Compile(ProcessPauseParamsSchema);
const validateProcessResumeParams = TypeCompiler.Compile(ProcessResumeParamsSchema);

export const processLifecycleHandlers: GatewayRequestHandlers = {
  /**
   * Run all ready tasks in a process.
   *
   * Note: This marks ready tasks as in-progress but does not actually execute them.
   * Task execution is handled by the agent via system events or cron jobs.
   */
  "process.run": async ({ params, respond }) => {
    if (!validateProcessRunParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.run params: ${formatErrors(validateProcessRunParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessRunParams;
    const agentId = resolveAgentId(p);

    try {
      const process = await getProcess(agentId, p.id);
      if (!process) {
        respond(false, undefined, notFoundError(`process not found: ${p.id}`));
        return;
      }

      if (process.status === "paused") {
        respond(false, undefined, invalidRequestError(`process is paused`));
        return;
      }

      // Get ready tasks (pending + dependencies met)
      const readyTasks = getReadyTasks(process);

      if (readyTasks.length === 0) {
        respond(true, { ok: true, tasksStarted: 0, message: "No ready tasks" });
        return;
      }

      // Start each ready task
      for (const task of readyTasks) {
        await setTaskStatus(agentId, p.id, task.id, "in-progress");
      }

      // Update process status
      await setProcessStatus(agentId, p.id, "active");

      respond(true, {
        ok: true,
        tasksStarted: readyTasks.length,
        taskIds: readyTasks.map((t) => t.id),
      });
    } catch (err) {
      respond(false, undefined, unavailableError(`failed to run process: ${String(err)}`));
    }
  },

  /**
   * Pause a process.
   */
  "process.pause": async ({ params, respond }) => {
    if (!validateProcessPauseParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.pause params: ${formatErrors(validateProcessPauseParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessPauseParams;
    const agentId = resolveAgentId(p);

    try {
      const updated = await setProcessStatus(agentId, p.id, "paused");
      if (!updated) {
        respond(false, undefined, notFoundError(`process not found: ${p.id}`));
        return;
      }

      respond(true, updated);
    } catch (err) {
      respond(false, undefined, unavailableError(`failed to pause process: ${String(err)}`));
    }
  },

  /**
   * Resume a paused process.
   */
  "process.resume": async ({ params, respond }) => {
    if (!validateProcessResumeParams.Check(params)) {
      respond(
        false,
        undefined,
        invalidRequestError(
          `invalid process.resume params: ${formatErrors(validateProcessResumeParams.Errors(params))}`,
        ),
      );
      return;
    }

    const p = params as ProcessResumeParams;
    const agentId = resolveAgentId(p);

    try {
      const process = await getProcess(agentId, p.id);
      if (!process) {
        respond(false, undefined, notFoundError(`process not found: ${p.id}`));
        return;
      }

      // Determine appropriate status
      let newStatus: ProcessStatus = "active";
      if (isProcessComplete(process)) {
        newStatus = "completed";
      } else if (hasFailedTasks(process)) {
        newStatus = "failed";
      }

      const updated = await setProcessStatus(agentId, p.id, newStatus);
      respond(true, updated);
    } catch (err) {
      respond(false, undefined, unavailableError(`failed to resume process: ${String(err)}`));
    }
  },
};
