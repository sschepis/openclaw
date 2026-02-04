/**
 * Process Lifecycle handlers - run, pause, resume operations.
 *
 * These handlers manage the overall state of a process, including
 * starting execution, pausing, and resuming operations.
 *
 * @module process/lifecycle
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

// Pre-compile validators for performance
const validateProcessRunParams = TypeCompiler.Compile(ProcessRunParamsSchema);
const validateProcessPauseParams = TypeCompiler.Compile(ProcessPauseParamsSchema);
const validateProcessResumeParams = TypeCompiler.Compile(ProcessResumeParamsSchema);

/**
 * Process statuses that can be run.
 */
const RUNNABLE_STATUSES: Set<ProcessStatus> = new Set(["draft", "active"]);

/**
 * Process statuses that can be paused.
 */
const PAUSABLE_STATUSES: Set<ProcessStatus> = new Set(["active"]);

/**
 * Process statuses that can be resumed.
 */
const RESUMABLE_STATUSES: Set<ProcessStatus> = new Set(["paused"]);

export const processLifecycleHandlers: GatewayRequestHandlers = {
  /**
   * Run all ready tasks in a process.
   *
   * This marks ready tasks (pending with satisfied dependencies) as in-progress.
   * Task execution is handled externally by the agent via system events or cron jobs.
   *
   * @remarks
   * - Process must not be paused, completed, or archived
   * - Only tasks with all dependencies completed will be started
   * - Returns the list of task IDs that were started
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

      // Check process status
      if (process.status === "paused") {
        respond(false, undefined, invalidRequestError(`process is paused; resume it first`));
        return;
      }

      if (process.status === "completed") {
        respond(false, undefined, invalidRequestError(`process is already completed`));
        return;
      }

      if (process.status === "archived") {
        respond(false, undefined, invalidRequestError(`cannot run archived process`));
        return;
      }

      if (process.status === "failed") {
        respond(
          false,
          undefined,
          invalidRequestError(`process has failed tasks; reset or resolve them first`),
        );
        return;
      }

      // Get ready tasks (pending/scheduled with dependencies satisfied)
      const readyTasks = getReadyTasks(process);

      if (readyTasks.length === 0) {
        // Check if process is complete
        if (isProcessComplete(process)) {
          await setProcessStatus(agentId, p.id, "completed");
          respond(true, {
            ok: true,
            tasksStarted: 0,
            message: "All tasks completed",
            processStatus: "completed",
          });
          return;
        }

        // Check if there are in-progress tasks
        const inProgressCount = process.tasks.filter((t) => t.status === "in-progress").length;

        if (inProgressCount > 0) {
          respond(true, {
            ok: true,
            tasksStarted: 0,
            message: `No new tasks ready; ${inProgressCount} task(s) in progress`,
            inProgressCount,
          });
          return;
        }

        // No ready tasks and no in-progress tasks - might be blocked
        const blockedCount = process.tasks.filter(
          (t) => t.status === "blocked" || (t.status === "pending" && t.dependsOn?.length),
        ).length;

        respond(true, {
          ok: true,
          tasksStarted: 0,
          message:
            blockedCount > 0 ? `${blockedCount} task(s) blocked on dependencies` : "No ready tasks",
        });
        return;
      }

      // Start each ready task
      const startedTaskIds: string[] = [];
      const startedPrompts: string[] = [];

      for (const task of readyTasks) {
        await setTaskStatus(agentId, p.id, task.id, "in-progress");
        startedTaskIds.push(task.id);
        if (task.prompt) {
          startedPrompts.push(task.prompt);
        }
      }

      // Update process status to active if it was draft
      if (process.status === "draft") {
        await setProcessStatus(agentId, p.id, "active");
      }

      respond(true, {
        ok: true,
        tasksStarted: startedTaskIds.length,
        taskIds: startedTaskIds,
        prompts: startedPrompts.length > 0 ? startedPrompts : undefined,
      });
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(
          `failed to run process: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  /**
   * Pause a process.
   *
   * Sets the process status to 'paused'. In-progress tasks will continue
   * to completion but no new tasks will be started.
   *
   * @remarks
   * - Only active processes can be paused
   * - Does not cancel in-progress tasks
   * - Use resume to continue the process
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
      // Check current status before pausing
      const process = await getProcess(agentId, p.id);
      if (!process) {
        respond(false, undefined, notFoundError(`process not found: ${p.id}`));
        return;
      }

      if (process.status === "paused") {
        respond(false, undefined, invalidRequestError(`process is already paused`));
        return;
      }

      if (process.status === "completed") {
        respond(false, undefined, invalidRequestError(`cannot pause completed process`));
        return;
      }

      if (process.status === "archived") {
        respond(false, undefined, invalidRequestError(`cannot pause archived process`));
        return;
      }

      const updated = await setProcessStatus(agentId, p.id, "paused");
      if (!updated) {
        respond(false, undefined, unavailableError(`failed to update process status`));
        return;
      }

      // Count in-progress tasks for informational response
      const inProgressCount = process.tasks.filter((t) => t.status === "in-progress").length;

      respond(true, {
        ...updated,
        _note: inProgressCount > 0 ? `${inProgressCount} task(s) still in progress` : undefined,
      });
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(
          `failed to pause process: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  /**
   * Resume a paused process.
   *
   * Sets the process status back to 'active' (or 'completed'/'failed'
   * based on current task states).
   *
   * @remarks
   * - Only paused processes can be resumed
   * - Automatically sets correct status based on task states
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

      if (process.status !== "paused") {
        respond(
          false,
          undefined,
          invalidRequestError(`cannot resume: process is ${process.status}, not paused`),
        );
        return;
      }

      // Determine appropriate status based on task states
      let newStatus: ProcessStatus = "active";

      if (isProcessComplete(process)) {
        newStatus = "completed";
      } else if (hasFailedTasks(process)) {
        newStatus = "failed";
      }

      const updated = await setProcessStatus(agentId, p.id, newStatus);
      if (!updated) {
        respond(false, undefined, unavailableError(`failed to update process status`));
        return;
      }

      // Get count of ready tasks for informational response
      const readyTasks = getReadyTasks(process);

      respond(true, {
        ...updated,
        _readyTasks: readyTasks.length,
      });
    } catch (err) {
      respond(
        false,
        undefined,
        unavailableError(
          `failed to resume process: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },
};
