/**
 * Process CRUD handlers - list, get, create, update, delete operations.
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

// Validators
const validateProcessListParams = TypeCompiler.Compile(ProcessListParamsSchema);
const validateProcessGetParams = TypeCompiler.Compile(ProcessGetParamsSchema);
const validateProcessCreateParams = TypeCompiler.Compile(ProcessCreateParamsSchema);
const validateProcessUpdateParams = TypeCompiler.Compile(ProcessUpdateParamsSchema);
const validateProcessDeleteParams = TypeCompiler.Compile(ProcessDeleteParamsSchema);

export const processCrudHandlers: GatewayRequestHandlers = {
  /**
   * List processes with optional filters.
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
      respond(false, undefined, unavailableError(`failed to list processes: ${String(err)}`));
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
      respond(false, undefined, unavailableError(`failed to get process: ${String(err)}`));
    }
  },

  /**
   * Create a new process.
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

          // Resolve dependsOn to task IDs
          const dependsOn = t.dependsOn?.map((dep) => taskMap.get(dep)).filter(Boolean) as
            | string[]
            | undefined;

          return createProcessTask({
            id: taskId,
            label: t.label,
            order: index,
            prompt: t.prompt,
            dependsOn,
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

      // Set initial status
      baseProcess.status = baseProcess.tasks.length > 0 ? "active" : "draft";

      // Save to store
      const created = await createProcess(agentId, baseProcess);

      respond(true, created);
    } catch (err) {
      respond(false, undefined, unavailableError(`failed to create process: ${String(err)}`));
    }
  },

  /**
   * Update an existing process.
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
      respond(false, undefined, unavailableError(`failed to update process: ${String(err)}`));
    }
  },

  /**
   * Delete a process.
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
      respond(false, undefined, unavailableError(`failed to delete process: ${String(err)}`));
    }
  },
};
