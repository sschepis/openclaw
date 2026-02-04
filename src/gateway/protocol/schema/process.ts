/**
 * Process Protocol Schema - TypeBox schemas for process API.
 */

import { Type } from "@sinclair/typebox";
import { CronScheduleSchema } from "./cron.js";
import { NonEmptyString } from "./primitives.js";

// ============================================================================
// Process Status
// ============================================================================

export const ProcessStatusSchema = Type.Union([
  Type.Literal("draft"),
  Type.Literal("active"),
  Type.Literal("paused"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("archived"),
]);

// ============================================================================
// Task Status
// ============================================================================

export const TaskStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("scheduled"),
  Type.Literal("in-progress"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("skipped"),
  Type.Literal("blocked"),
]);

// ============================================================================
// Process Task
// ============================================================================

export const ProcessTaskSchema = Type.Object(
  {
    id: NonEmptyString,
    label: NonEmptyString,
    description: Type.Optional(Type.String()),
    status: TaskStatusSchema,
    order: Type.Integer({ minimum: 0 }),
    dependsOn: Type.Optional(Type.Array(NonEmptyString)),
    cronJobId: Type.Optional(NonEmptyString),
    prompt: Type.Optional(Type.String()),
    lastRunAt: Type.Optional(Type.Integer({ minimum: 0 })),
    nextRunAt: Type.Optional(Type.Integer({ minimum: 0 })),
    lastDurationMs: Type.Optional(Type.Integer({ minimum: 0 })),
    lastError: Type.Optional(Type.String()),
    result: Type.Optional(Type.Unknown()),
    meta: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

// ============================================================================
// Process Schedule
// ============================================================================

export const ProcessScheduleModeSchema = Type.Union([
  Type.Literal("manual"),
  Type.Literal("once"),
  Type.Literal("recurring"),
  Type.Literal("event-driven"),
]);

export const ProcessScheduleSchema = Type.Object(
  {
    mode: ProcessScheduleModeSchema,
    cronSchedule: Type.Optional(CronScheduleSchema),
    runAtMs: Type.Optional(Type.Integer({ minimum: 0 })),
    triggerEvents: Type.Optional(Type.Array(Type.String())),
    timezone: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

// ============================================================================
// Process Interface (External Visibility)
// ============================================================================

export const ProcessViewKindSchema = Type.Union([
  Type.Literal("task-list"),
  Type.Literal("kanban"),
  Type.Literal("timeline"),
  Type.Literal("metrics"),
  Type.Literal("custom"),
]);

export const ProcessActionVariantSchema = Type.Union([
  Type.Literal("primary"),
  Type.Literal("secondary"),
  Type.Literal("danger"),
]);

export const ProcessActionSchema = Type.Object(
  {
    id: NonEmptyString,
    label: NonEmptyString,
    description: Type.String(),
    variant: ProcessActionVariantSchema,
    promptTemplate: Type.String(),
    confirmRequired: Type.Optional(Type.Boolean()),
    icon: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ProcessInterfaceSchema = Type.Object(
  {
    viewKind: ProcessViewKindSchema,
    allowReorder: Type.Boolean(),
    allowManualRun: Type.Boolean(),
    allowPause: Type.Boolean(),
    visibleFields: Type.Array(Type.String()),
    actions: Type.Array(ProcessActionSchema),
  },
  { additionalProperties: false },
);

// ============================================================================
// Process Inputs/Outputs
// ============================================================================

export const ProcessInputTypeSchema = Type.Union([
  Type.Literal("text"),
  Type.Literal("number"),
  Type.Literal("boolean"),
  Type.Literal("json"),
  Type.Literal("file"),
]);

export const ProcessInputSchema = Type.Object(
  {
    name: NonEmptyString,
    label: NonEmptyString,
    type: ProcessInputTypeSchema,
    required: Type.Boolean(),
    defaultValue: Type.Optional(Type.Unknown()),
    description: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ProcessOutputSchema = Type.Object(
  {
    name: NonEmptyString,
    label: NonEmptyString,
    type: ProcessInputTypeSchema,
    description: Type.Optional(Type.String()),
    extractPath: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

// ============================================================================
// Process Descriptor
// ============================================================================

export const ProcessDescriptorSchema = Type.Object(
  {
    id: NonEmptyString,
    name: NonEmptyString,
    description: Type.Optional(Type.String()),
    agentId: NonEmptyString,
    createdFromSessionKey: NonEmptyString,
    status: ProcessStatusSchema,
    createdAt: Type.Integer({ minimum: 0 }),
    updatedAt: Type.Integer({ minimum: 0 }),
    tasks: Type.Array(ProcessTaskSchema),
    schedule: Type.Optional(ProcessScheduleSchema),
    interface: ProcessInterfaceSchema,
    composedFrom: Type.Optional(Type.Array(NonEmptyString)),
    inputs: Type.Optional(Type.Array(ProcessInputSchema)),
    outputs: Type.Optional(Type.Array(ProcessOutputSchema)),
    inputValues: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    outputValues: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    tags: Type.Optional(Type.Array(Type.String())),
    meta: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

// ============================================================================
// API Request/Response Schemas
// ============================================================================

// process.list
export const ProcessListParamsSchema = Type.Object(
  {
    agentId: Type.Optional(NonEmptyString),
    status: Type.Optional(Type.Array(ProcessStatusSchema)),
    tags: Type.Optional(Type.Array(Type.String())),
    search: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
  },
  { additionalProperties: false },
);

export const ProcessListResultSchema = Type.Object(
  {
    ts: Type.Integer({ minimum: 0 }),
    count: Type.Integer({ minimum: 0 }),
    processes: Type.Array(ProcessDescriptorSchema),
  },
  { additionalProperties: false },
);

// process.get
export const ProcessGetParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    agentId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

// process.create
export const ProcessCreateParamsSchema = Type.Object(
  {
    name: NonEmptyString,
    description: Type.Optional(Type.String()),
    agentId: Type.Optional(NonEmptyString),
    sessionKey: NonEmptyString,
    tasks: Type.Optional(
      Type.Array(
        Type.Object(
          {
            label: NonEmptyString,
            description: Type.Optional(Type.String()),
            prompt: Type.Optional(Type.String()),
            dependsOn: Type.Optional(Type.Array(NonEmptyString)),
          },
          { additionalProperties: false },
        ),
      ),
    ),
    schedule: Type.Optional(ProcessScheduleSchema),
    interface: Type.Optional(Type.Partial(ProcessInterfaceSchema, { additionalProperties: false })),
    inputs: Type.Optional(Type.Array(ProcessInputSchema)),
    outputs: Type.Optional(Type.Array(ProcessOutputSchema)),
    tags: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);

// process.update
export const ProcessUpdateParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    agentId: Type.Optional(NonEmptyString),
    patch: Type.Object(
      {
        name: Type.Optional(NonEmptyString),
        description: Type.Optional(Type.String()),
        status: Type.Optional(ProcessStatusSchema),
        schedule: Type.Optional(ProcessScheduleSchema),
        interface: Type.Optional(Type.Partial(ProcessInterfaceSchema)),
        inputValues: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
        tags: Type.Optional(Type.Array(Type.String())),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

// process.delete
export const ProcessDeleteParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    agentId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

// process.task.update
export const ProcessTaskUpdateParamsSchema = Type.Object(
  {
    processId: NonEmptyString,
    taskId: NonEmptyString,
    agentId: Type.Optional(NonEmptyString),
    patch: Type.Object(
      {
        label: Type.Optional(NonEmptyString),
        description: Type.Optional(Type.String()),
        status: Type.Optional(TaskStatusSchema),
        prompt: Type.Optional(Type.String()),
        result: Type.Optional(Type.Unknown()),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

// process.task.add
export const ProcessTaskAddParamsSchema = Type.Object(
  {
    processId: NonEmptyString,
    agentId: Type.Optional(NonEmptyString),
    task: Type.Object(
      {
        label: NonEmptyString,
        description: Type.Optional(Type.String()),
        prompt: Type.Optional(Type.String()),
        dependsOn: Type.Optional(Type.Array(NonEmptyString)),
        insertAfter: Type.Optional(NonEmptyString),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

// process.task.remove
export const ProcessTaskRemoveParamsSchema = Type.Object(
  {
    processId: NonEmptyString,
    taskId: NonEmptyString,
    agentId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

// process.task.reorder
export const ProcessTaskReorderParamsSchema = Type.Object(
  {
    processId: NonEmptyString,
    agentId: Type.Optional(NonEmptyString),
    taskIds: Type.Array(NonEmptyString),
  },
  { additionalProperties: false },
);

// process.task.run
export const ProcessTaskRunParamsSchema = Type.Object(
  {
    processId: NonEmptyString,
    taskId: NonEmptyString,
    agentId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

// process.run (run all pending tasks)
export const ProcessRunParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    agentId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

// process.pause
export const ProcessPauseParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    agentId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

// process.resume
export const ProcessResumeParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    agentId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

// ============================================================================
// Exports for Validation
// ============================================================================

export type ProcessListParams = {
  agentId?: string;
  status?: string[];
  tags?: string[];
  search?: string;
  limit?: number;
};

export type ProcessGetParams = {
  id: string;
  agentId?: string;
};

export type ProcessCreateParams = {
  name: string;
  description?: string;
  agentId?: string;
  sessionKey: string;
  tasks?: Array<{
    label: string;
    description?: string;
    prompt?: string;
    dependsOn?: string[];
  }>;
  schedule?: {
    mode: string;
    cronSchedule?: unknown;
    runAtMs?: number;
    triggerEvents?: string[];
    timezone?: string;
  };
  interface?: Partial<{
    viewKind: string;
    allowReorder: boolean;
    allowManualRun: boolean;
    allowPause: boolean;
    visibleFields: string[];
    actions: unknown[];
  }>;
  inputs?: unknown[];
  outputs?: unknown[];
  tags?: string[];
};

export type ProcessUpdateParams = {
  id: string;
  agentId?: string;
  patch: {
    name?: string;
    description?: string;
    status?: string;
    schedule?: unknown;
    interface?: unknown;
    inputValues?: Record<string, unknown>;
    tags?: string[];
  };
};

export type ProcessDeleteParams = {
  id: string;
  agentId?: string;
};

export type ProcessTaskUpdateParams = {
  processId: string;
  taskId: string;
  agentId?: string;
  patch: {
    label?: string;
    description?: string;
    status?: string;
    prompt?: string;
    result?: unknown;
  };
};

export type ProcessTaskAddParams = {
  processId: string;
  agentId?: string;
  task: {
    label: string;
    description?: string;
    prompt?: string;
    dependsOn?: string[];
    insertAfter?: string;
  };
};

export type ProcessTaskRemoveParams = {
  processId: string;
  taskId: string;
  agentId?: string;
};

export type ProcessTaskReorderParams = {
  processId: string;
  agentId?: string;
  taskIds: string[];
};

export type ProcessTaskRunParams = {
  processId: string;
  taskId: string;
  agentId?: string;
};

export type ProcessRunParams = {
  id: string;
  agentId?: string;
};

export type ProcessPauseParams = {
  id: string;
  agentId?: string;
};

export type ProcessResumeParams = {
  id: string;
  agentId?: string;
};
