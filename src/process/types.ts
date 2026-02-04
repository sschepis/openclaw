/**
 * Process Types - Core data model for conversation-as-process-interface.
 *
 * A ProcessDescriptor represents a reusable, composable process definition
 * that was created from a conversation. It contains tasks, scheduling info,
 * and interface configuration for external visibility.
 */

import type { CronSchedule } from "../cron/types.js";

// ============================================================================
// Process Status
// ============================================================================

export type ProcessStatus =
  | "draft" // Being defined via conversation
  | "active" // Running/scheduled
  | "paused" // Temporarily stopped
  | "completed" // All tasks finished successfully
  | "failed" // One or more tasks failed
  | "archived"; // No longer active but preserved

// ============================================================================
// Process Task
// ============================================================================

export type TaskStatus =
  | "pending" // Not yet started
  | "scheduled" // Has a future run scheduled
  | "in-progress" // Currently executing
  | "completed" // Finished successfully
  | "failed" // Finished with error
  | "skipped" // Bypassed (dependency not met or manual skip)
  | "blocked"; // Waiting on dependencies

export type ProcessTask = {
  /** Unique task identifier within the process. */
  id: string;

  /** Human-readable task label. */
  label: string;

  /** Optional detailed description. */
  description?: string;

  /** Current task status. */
  status: TaskStatus;

  /** Display order (0-based). */
  order: number;

  /** IDs of tasks that must complete before this one can run. */
  dependsOn?: string[];

  /** Linked cron job ID if this task is scheduled. */
  cronJobId?: string;

  /** Agent prompt to execute for this task. */
  prompt?: string;

  /** Last execution timestamp (ms). */
  lastRunAt?: number;

  /** Next scheduled execution timestamp (ms). */
  nextRunAt?: number;

  /** Duration of last run (ms). */
  lastDurationMs?: number;

  /** Error message from last failed run. */
  lastError?: string;

  /** Result/output from last successful run. */
  result?: unknown;

  /** Metadata extracted from conversation defining this task. */
  meta?: Record<string, unknown>;
};

// ============================================================================
// Process Schedule
// ============================================================================

export type ProcessScheduleMode =
  | "manual" // Only runs when manually triggered
  | "once" // Runs once at a specific time
  | "recurring" // Runs on a schedule
  | "event-driven"; // Runs in response to events

export type ProcessSchedule = {
  /** How this process is triggered. */
  mode: ProcessScheduleMode;

  /** Cron schedule for recurring mode. */
  cronSchedule?: CronSchedule;

  /** For "once" mode - when to run. */
  runAtMs?: number;

  /** For "event-driven" - what events trigger this process. */
  triggerEvents?: string[];

  /** Timezone for schedule interpretation. */
  timezone?: string;
};

// ============================================================================
// Process Interface (External Visibility)
// ============================================================================

export type ProcessViewKind =
  | "task-list" // Simple checklist view
  | "kanban" // Board with status columns
  | "timeline" // Gantt/timeline view
  | "metrics" // Dashboard with metrics
  | "custom"; // Custom visualization

export type ProcessActionVariant = "primary" | "secondary" | "danger";

export type ProcessAction = {
  /** Action identifier. */
  id: string;

  /** Display label. */
  label: string;

  /** Tooltip/description. */
  description: string;

  /** Button variant. */
  variant: ProcessActionVariant;

  /** Prompt template to send to agent when action is triggered. */
  promptTemplate: string;

  /** Whether confirmation is required. */
  confirmRequired?: boolean;

  /** Icon name (optional). */
  icon?: string;
};

export type ProcessInterface = {
  /** Preferred visualization type. */
  viewKind: ProcessViewKind;

  /** Whether tasks can be manually reordered. */
  allowReorder: boolean;

  /** Whether individual tasks can be manually run. */
  allowManualRun: boolean;

  /** Whether the process can be paused. */
  allowPause: boolean;

  /** Which fields are visible in external view. */
  visibleFields: string[];

  /** Available actions for this process. */
  actions: ProcessAction[];
};

// ============================================================================
// Process Inputs/Outputs (for composition)
// ============================================================================

export type ProcessInputType = "text" | "number" | "boolean" | "json" | "file";

export type ProcessInput = {
  /** Input name/key. */
  name: string;

  /** Display label. */
  label: string;

  /** Input type. */
  type: ProcessInputType;

  /** Whether this input is required. */
  required: boolean;

  /** Default value. */
  defaultValue?: unknown;

  /** Description for the user. */
  description?: string;
};

export type ProcessOutput = {
  /** Output name/key. */
  name: string;

  /** Display label. */
  label: string;

  /** Output type. */
  type: ProcessInputType;

  /** Description of what this output represents. */
  description?: string;

  /** Path to extract value from task results. */
  extractPath?: string;
};

// ============================================================================
// Process Descriptor (Main Entity)
// ============================================================================

export type ProcessDescriptor = {
  /** Unique process identifier (UUID). */
  id: string;

  /** Human-readable process name. */
  name: string;

  /** Optional description. */
  description?: string;

  /** Agent ID that owns this process. */
  agentId: string;

  /** Session key where this process was created. */
  createdFromSessionKey: string;

  /** Current process status. */
  status: ProcessStatus;

  /** Creation timestamp (ms). */
  createdAt: number;

  /** Last update timestamp (ms). */
  updatedAt: number;

  /** Tasks within this process. */
  tasks: ProcessTask[];

  /** Scheduling configuration. */
  schedule?: ProcessSchedule;

  /** Interface/visibility configuration. */
  interface: ProcessInterface;

  /** IDs of parent processes (for composition). */
  composedFrom?: string[];

  /** Input definitions for parameterized processes. */
  inputs?: ProcessInput[];

  /** Output definitions for process results. */
  outputs?: ProcessOutput[];

  /** Current input values (when running). */
  inputValues?: Record<string, unknown>;

  /** Current output values (after completion). */
  outputValues?: Record<string, unknown>;

  /** Tags for categorization. */
  tags?: string[];

  /** Arbitrary metadata. */
  meta?: Record<string, unknown>;
};

// ============================================================================
// Process Store Types
// ============================================================================

export type ProcessStore = {
  /** Store version for migrations. */
  version: number;

  /** All process descriptors indexed by ID. */
  processes: Record<string, ProcessDescriptor>;
};

export type ProcessFilters = {
  /** Filter by status. */
  status?: ProcessStatus[];

  /** Filter by agent ID. */
  agentId?: string;

  /** Filter by tags. */
  tags?: string[];

  /** Search in name/description. */
  search?: string;

  /** Limit number of results. */
  limit?: number;
};

// ============================================================================
// Process Events (for real-time updates)
// ============================================================================

export type ProcessEventType =
  | "process:created"
  | "process:updated"
  | "process:deleted"
  | "process:status:changed"
  | "task:started"
  | "task:completed"
  | "task:failed"
  | "task:skipped";

export type ProcessEvent = {
  type: ProcessEventType;
  processId: string;
  taskId?: string;
  timestamp: number;
  data?: Record<string, unknown>;
};

// ============================================================================
// Factory Functions
// ============================================================================

export function createEmptyProcessDescriptor(params: {
  id: string;
  name: string;
  agentId: string;
  createdFromSessionKey: string;
}): ProcessDescriptor {
  const now = Date.now();
  return {
    id: params.id,
    name: params.name,
    description: undefined,
    agentId: params.agentId,
    createdFromSessionKey: params.createdFromSessionKey,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    tasks: [],
    schedule: undefined,
    interface: {
      viewKind: "task-list",
      allowReorder: true,
      allowManualRun: true,
      allowPause: true,
      visibleFields: ["status", "label", "lastRunAt", "nextRunAt"],
      actions: [],
    },
    composedFrom: undefined,
    inputs: undefined,
    outputs: undefined,
    inputValues: undefined,
    outputValues: undefined,
    tags: undefined,
    meta: undefined,
  };
}

export function createProcessTask(params: {
  id: string;
  label: string;
  order: number;
  prompt?: string;
  dependsOn?: string[];
}): ProcessTask {
  return {
    id: params.id,
    label: params.label,
    description: undefined,
    status: "pending",
    order: params.order,
    dependsOn: params.dependsOn,
    cronJobId: undefined,
    prompt: params.prompt,
    lastRunAt: undefined,
    nextRunAt: undefined,
    lastDurationMs: undefined,
    lastError: undefined,
    result: undefined,
    meta: undefined,
  };
}

export function createDefaultProcessInterface(): ProcessInterface {
  return {
    viewKind: "task-list",
    allowReorder: true,
    allowManualRun: true,
    allowPause: true,
    visibleFields: ["status", "label", "lastRunAt", "nextRunAt"],
    actions: [
      {
        id: "run-all",
        label: "Run All",
        description: "Execute all pending tasks in order.",
        variant: "primary",
        promptTemplate: "Run all pending tasks for this process.",
        confirmRequired: false,
      },
      {
        id: "pause",
        label: "Pause",
        description: "Pause the process and cancel scheduled runs.",
        variant: "secondary",
        promptTemplate: "Pause this process.",
        confirmRequired: true,
      },
      {
        id: "reset",
        label: "Reset",
        description: "Reset all tasks to pending status.",
        variant: "danger",
        promptTemplate: "Reset all tasks in this process to pending.",
        confirmRequired: true,
      },
    ],
  };
}
