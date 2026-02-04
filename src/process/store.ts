/**
 * Process Store - CRUD operations for process descriptors.
 *
 * Processes are stored per-agent in ~/.openclaw/agents/<agentId>/processes/processes.json
 */

import JSON5 from "json5";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  ProcessDescriptor,
  ProcessFilters,
  ProcessStore,
  ProcessTask,
  TaskStatus,
} from "./types.js";
import { resolveStateDir } from "../config/paths.js";
import { normalizeAgentId } from "../routing/session-key.js";

// ============================================================================
// Constants
// ============================================================================

const PROCESS_STORE_VERSION = 1;
const PROCESS_STORE_FILENAME = "processes.json";

// ============================================================================
// Path Resolution
// ============================================================================

export function resolveProcessStoreDir(agentId?: string): string {
  const stateDir = resolveStateDir();
  const normalizedAgentId = normalizeAgentId(agentId);
  return path.join(stateDir, "agents", normalizedAgentId, "processes");
}

export function resolveProcessStorePath(agentId?: string): string {
  return path.join(resolveProcessStoreDir(agentId), PROCESS_STORE_FILENAME);
}

// ============================================================================
// Store Loading/Saving
// ============================================================================

function createEmptyStore(): ProcessStore {
  return {
    version: PROCESS_STORE_VERSION,
    processes: {},
  };
}

function isValidProcessStore(value: unknown): value is ProcessStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.version !== "number") {
    return false;
  }
  if (!record.processes || typeof record.processes !== "object") {
    return false;
  }
  return true;
}

export function loadProcessStore(agentId?: string): ProcessStore {
  const storePath = resolveProcessStorePath(agentId);

  try {
    if (!fs.existsSync(storePath)) {
      return createEmptyStore();
    }
    const raw = fs.readFileSync(storePath, "utf-8");
    const parsed = JSON5.parse(raw);

    if (!isValidProcessStore(parsed)) {
      return createEmptyStore();
    }

    return parsed;
  } catch {
    return createEmptyStore();
  }
}

async function saveProcessStoreUnlocked(storePath: string, store: ProcessStore): Promise<void> {
  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
  const json = JSON.stringify(store, null, 2);

  if (process.platform === "win32") {
    await fs.promises.writeFile(storePath, json, "utf-8");
    return;
  }

  const tmp = `${storePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(tmp, json, { mode: 0o600, encoding: "utf-8" });
    await fs.promises.rename(tmp, storePath);
    await fs.promises.chmod(storePath, 0o600);
  } finally {
    await fs.promises.rm(tmp, { force: true });
  }
}

// ============================================================================
// Store Locking
// ============================================================================

type ProcessStoreLockOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
  staleMs?: number;
};

async function withProcessStoreLock<T>(
  storePath: string,
  fn: () => Promise<T>,
  opts: ProcessStoreLockOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 25;
  const staleMs = opts.staleMs ?? 30_000;
  const lockPath = `${storePath}.lock`;
  const startedAt = Date.now();

  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });

  while (true) {
    try {
      const handle = await fs.promises.open(lockPath, "wx");
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
          "utf-8",
        );
      } catch {
        // best-effort
      }
      await handle.close();
      break;
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code)
          : null;

      if (code === "ENOENT") {
        await fs.promises
          .mkdir(path.dirname(storePath), { recursive: true })
          .catch(() => undefined);
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        continue;
      }

      if (code !== "EEXIST") {
        throw err;
      }

      const now = Date.now();
      if (now - startedAt > timeoutMs) {
        throw new Error(`timeout acquiring process store lock: ${lockPath}`, {
          cause: err,
        });
      }

      // Stale lock eviction
      try {
        const st = await fs.promises.stat(lockPath);
        const ageMs = now - st.mtimeMs;
        if (ageMs > staleMs) {
          await fs.promises.unlink(lockPath);
          continue;
        }
      } catch {
        // ignore
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  try {
    return await fn();
  } finally {
    await fs.promises.unlink(lockPath).catch(() => undefined);
  }
}

export async function saveProcessStore(agentId: string, store: ProcessStore): Promise<void> {
  const storePath = resolveProcessStorePath(agentId);
  await withProcessStoreLock(storePath, async () => {
    await saveProcessStoreUnlocked(storePath, store);
  });
}

export async function updateProcessStore<T>(
  agentId: string,
  mutator: (store: ProcessStore) => Promise<T> | T,
): Promise<T> {
  const storePath = resolveProcessStorePath(agentId);
  return await withProcessStoreLock(storePath, async () => {
    const store = loadProcessStore(agentId);
    const result = await mutator(store);
    await saveProcessStoreUnlocked(storePath, store);
    return result;
  });
}

// ============================================================================
// CRUD Operations
// ============================================================================

export async function createProcess(
  agentId: string,
  process: ProcessDescriptor,
): Promise<ProcessDescriptor> {
  return await updateProcessStore(agentId, (store) => {
    if (store.processes[process.id]) {
      throw new Error(`Process already exists: ${process.id}`);
    }
    const now = Date.now();
    const created: ProcessDescriptor = {
      ...process,
      createdAt: now,
      updatedAt: now,
    };
    store.processes[process.id] = created;
    return created;
  });
}

export async function getProcess(
  agentId: string,
  processId: string,
): Promise<ProcessDescriptor | null> {
  const store = loadProcessStore(agentId);
  return store.processes[processId] ?? null;
}

export async function updateProcess(
  agentId: string,
  processId: string,
  patch: Partial<ProcessDescriptor>,
): Promise<ProcessDescriptor | null> {
  return await updateProcessStore(agentId, (store) => {
    const existing = store.processes[processId];
    if (!existing) {
      return null;
    }
    const updated: ProcessDescriptor = {
      ...existing,
      ...patch,
      id: existing.id, // Prevent ID changes
      createdAt: existing.createdAt, // Preserve creation time
      updatedAt: Date.now(),
    };
    store.processes[processId] = updated;
    return updated;
  });
}

export async function deleteProcess(agentId: string, processId: string): Promise<boolean> {
  return await updateProcessStore(agentId, (store) => {
    if (!store.processes[processId]) {
      return false;
    }
    delete store.processes[processId];
    return true;
  });
}

export async function listProcesses(
  agentId: string,
  filters?: ProcessFilters,
): Promise<ProcessDescriptor[]> {
  const store = loadProcessStore(agentId);
  let processes = Object.values(store.processes);

  if (filters?.status && filters.status.length > 0) {
    const statusSet = new Set(filters.status);
    processes = processes.filter((p) => statusSet.has(p.status));
  }

  if (filters?.tags && filters.tags.length > 0) {
    const tagSet = new Set(filters.tags);
    processes = processes.filter((p) => p.tags?.some((t) => tagSet.has(t)));
  }

  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    processes = processes.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower),
    );
  }

  // Sort by updatedAt descending
  processes.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  if (filters?.limit && filters.limit > 0) {
    processes = processes.slice(0, filters.limit);
  }

  return processes;
}

// ============================================================================
// Task Operations
// ============================================================================

export async function updateProcessTask(
  agentId: string,
  processId: string,
  taskId: string,
  patch: Partial<ProcessTask>,
): Promise<ProcessTask | null> {
  return await updateProcessStore(agentId, (store) => {
    const process = store.processes[processId];
    if (!process) {
      return null;
    }

    const taskIndex = process.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      return null;
    }

    const existing = process.tasks[taskIndex];
    const updated: ProcessTask = {
      ...existing,
      ...patch,
      id: existing.id, // Prevent ID changes
    };
    process.tasks[taskIndex] = updated;
    process.updatedAt = Date.now();

    return updated;
  });
}

export async function addProcessTask(
  agentId: string,
  processId: string,
  task: ProcessTask,
): Promise<ProcessTask | null> {
  return await updateProcessStore(agentId, (store) => {
    const process = store.processes[processId];
    if (!process) {
      return null;
    }

    // Check for duplicate ID
    if (process.tasks.some((t) => t.id === task.id)) {
      throw new Error(`Task already exists: ${task.id}`);
    }

    process.tasks.push(task);
    process.updatedAt = Date.now();

    return task;
  });
}

export async function removeProcessTask(
  agentId: string,
  processId: string,
  taskId: string,
): Promise<boolean> {
  return await updateProcessStore(agentId, (store) => {
    const process = store.processes[processId];
    if (!process) {
      return false;
    }

    const taskIndex = process.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      return false;
    }

    process.tasks.splice(taskIndex, 1);
    process.updatedAt = Date.now();

    return true;
  });
}

export async function reorderProcessTasks(
  agentId: string,
  processId: string,
  taskIds: string[],
): Promise<boolean> {
  return await updateProcessStore(agentId, (store) => {
    const process = store.processes[processId];
    if (!process) {
      return false;
    }

    // Validate all task IDs exist
    const existingIds = new Set(process.tasks.map((t) => t.id));
    for (const id of taskIds) {
      if (!existingIds.has(id)) {
        throw new Error(`Unknown task ID: ${id}`);
      }
    }

    // Reorder tasks based on taskIds array
    const taskMap = new Map(process.tasks.map((t) => [t.id, t]));
    const reordered: ProcessTask[] = [];

    for (let i = 0; i < taskIds.length; i++) {
      const task = taskMap.get(taskIds[i]);
      if (task) {
        reordered.push({ ...task, order: i });
        taskMap.delete(taskIds[i]);
      }
    }

    // Add any remaining tasks not in taskIds at the end
    let nextOrder = reordered.length;
    for (const task of taskMap.values()) {
      reordered.push({ ...task, order: nextOrder++ });
    }

    process.tasks = reordered;
    process.updatedAt = Date.now();

    return true;
  });
}

// ============================================================================
// Status Transitions
// ============================================================================

export async function setProcessStatus(
  agentId: string,
  processId: string,
  status: ProcessDescriptor["status"],
): Promise<ProcessDescriptor | null> {
  return await updateProcess(agentId, processId, { status });
}

export async function setTaskStatus(
  agentId: string,
  processId: string,
  taskId: string,
  status: TaskStatus,
  result?: { result?: unknown; error?: string; durationMs?: number },
): Promise<ProcessTask | null> {
  const patch: Partial<ProcessTask> = { status };

  if (status === "in-progress") {
    patch.lastRunAt = Date.now();
  }

  if (status === "completed" || status === "failed") {
    if (result?.durationMs !== undefined) {
      patch.lastDurationMs = result.durationMs;
    }
    if (result?.result !== undefined) {
      patch.result = result.result;
    }
    if (result?.error !== undefined) {
      patch.lastError = result.error;
    }
  }

  return await updateProcessTask(agentId, processId, taskId, patch);
}

// ============================================================================
// Utility Functions
// ============================================================================

export function generateProcessId(): string {
  return crypto.randomUUID();
}

export function generateTaskId(): string {
  return `task-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Get tasks that are ready to run (pending + all dependencies completed).
 */
export function getReadyTasks(process: ProcessDescriptor): ProcessTask[] {
  const completedIds = new Set(
    process.tasks.filter((t) => t.status === "completed").map((t) => t.id),
  );

  return process.tasks.filter((task) => {
    if (task.status !== "pending" && task.status !== "scheduled") {
      return false;
    }
    if (!task.dependsOn || task.dependsOn.length === 0) {
      return true;
    }
    return task.dependsOn.every((depId) => completedIds.has(depId));
  });
}

/**
 * Check if all tasks are completed.
 */
export function isProcessComplete(process: ProcessDescriptor): boolean {
  return process.tasks.every((t) => t.status === "completed");
}

/**
 * Check if any task has failed.
 */
export function hasFailedTasks(process: ProcessDescriptor): boolean {
  return process.tasks.some((t) => t.status === "failed");
}

/**
 * Calculate overall progress percentage.
 */
export function calculateProcessProgress(process: ProcessDescriptor): number {
  if (process.tasks.length === 0) {
    return 0;
  }
  const completed = process.tasks.filter((t) => t.status === "completed").length;
  return Math.round((completed / process.tasks.length) * 100);
}
