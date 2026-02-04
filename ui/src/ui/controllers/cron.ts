import type { GatewayBrowserClient } from "../gateway";
import type { CronJob, CronRunLogEntry, CronStatus } from "../types";
import type { ActionMessage } from "../types/chat-types";
import type { CronFormState } from "../ui-types";
import { toNumber } from "../format";

export type CronState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  cronLoading: boolean;
  cronJobs: CronJob[];
  cronStatus: CronStatus | null;
  cronError: string | null;
  cronForm: CronFormState;
  cronRunsJobId: string | null;
  cronRuns: CronRunLogEntry[];
  cronBusy: boolean;
  addActionMessage?: (action: ActionMessage) => void;
};

export async function loadCronStatus(state: CronState) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const res = await state.client.request("cron.status", {});
    state.cronStatus = res;
  } catch (err) {
    state.cronError = String(err);
  }
}

export async function loadCronJobs(state: CronState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.cronLoading) {
    return;
  }
  state.cronLoading = true;
  state.cronError = null;
  try {
    const res = await state.client.request("cron.list", {
      includeDisabled: true,
    });
    state.cronJobs = Array.isArray(res.jobs) ? res.jobs : [];
  } catch (err) {
    state.cronError = String(err);
  } finally {
    state.cronLoading = false;
  }
}

export function buildCronSchedule(form: CronFormState) {
  if (form.scheduleKind === "at") {
    const ms = Date.parse(form.scheduleAt);
    if (!Number.isFinite(ms)) {
      throw new Error("Invalid run time.");
    }
    return { kind: "at" as const, atMs: ms };
  }
  if (form.scheduleKind === "every") {
    const amount = toNumber(form.everyAmount, 0);
    if (amount <= 0) {
      throw new Error("Invalid interval amount.");
    }
    const unit = form.everyUnit;
    const mult = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
    return { kind: "every" as const, everyMs: amount * mult };
  }
  const expr = form.cronExpr.trim();
  if (!expr) {
    throw new Error("Cron expression required.");
  }
  return { kind: "cron" as const, expr, tz: form.cronTz.trim() || undefined };
}

export function buildCronPayload(form: CronFormState) {
  if (form.payloadKind === "systemEvent") {
    const text = form.payloadText.trim();
    if (!text) {
      throw new Error("System event text required.");
    }
    return { kind: "systemEvent" as const, text };
  }
  const message = form.payloadText.trim();
  if (!message) {
    throw new Error("Agent message required.");
  }
  const payload: {
    kind: "agentTurn";
    message: string;
    deliver?: boolean;
    channel?: string;
    to?: string;
    timeoutSeconds?: number;
  } = { kind: "agentTurn", message };
  if (form.deliver) {
    payload.deliver = true;
  }
  if (form.channel) {
    payload.channel = form.channel;
  }
  if (form.to.trim()) {
    payload.to = form.to.trim();
  }
  const timeoutSeconds = toNumber(form.timeoutSeconds, 0);
  if (timeoutSeconds > 0) {
    payload.timeoutSeconds = timeoutSeconds;
  }
  return payload;
}

export async function addCronJob(state: CronState) {
  if (!state.client || !state.connected || state.cronBusy) {
    return;
  }
  state.cronBusy = true;
  state.cronError = null;
  try {
    const schedule = buildCronSchedule(state.cronForm);
    const payload = buildCronPayload(state.cronForm);
    const agentId = state.cronForm.agentId.trim();
    const jobName = state.cronForm.name.trim();
    const job = {
      name: jobName,
      description: state.cronForm.description.trim() || undefined,
      agentId: agentId || undefined,
      enabled: state.cronForm.enabled,
      schedule,
      sessionTarget: state.cronForm.sessionTarget,
      wakeMode: state.cronForm.wakeMode,
      payload,
      isolation:
        state.cronForm.postToMainPrefix.trim() && state.cronForm.sessionTarget === "isolated"
          ? { postToMainPrefix: state.cronForm.postToMainPrefix.trim() }
          : undefined,
    };
    if (!job.name) {
      throw new Error("Name required.");
    }
    await state.client.request("cron.add", job);

    // Add an action message about the cron job creation
    if (state.addActionMessage) {
      const scheduleDescription = formatScheduleDescription(schedule);
      state.addActionMessage({
        type: "cron-created",
        title: `Scheduled job created: ${jobName}`,
        description: scheduleDescription,
        timestamp: Date.now(),
        details: {
          session: state.cronForm.sessionTarget,
          wake: state.cronForm.wakeMode,
          enabled: state.cronForm.enabled ? "yes" : "no",
        },
      });
    }

    state.cronForm = {
      ...state.cronForm,
      name: "",
      description: "",
      payloadText: "",
    };
    await loadCronJobs(state);
    await loadCronStatus(state);
  } catch (err) {
    state.cronError = String(err);
  } finally {
    state.cronBusy = false;
  }
}

/**
 * Formats a schedule into a human-readable description.
 */
function formatScheduleDescription(schedule: ReturnType<typeof buildCronSchedule>): string {
  if (schedule.kind === "at") {
    const date = new Date(schedule.atMs);
    return `Runs once at ${date.toLocaleString()}`;
  }
  if (schedule.kind === "every") {
    const ms = schedule.everyMs;
    if (ms >= 86_400_000) {
      const days = Math.floor(ms / 86_400_000);
      return `Runs every ${days} day${days > 1 ? "s" : ""}`;
    }
    if (ms >= 3_600_000) {
      const hours = Math.floor(ms / 3_600_000);
      return `Runs every ${hours} hour${hours > 1 ? "s" : ""}`;
    }
    const minutes = Math.floor(ms / 60_000);
    return `Runs every ${minutes} minute${minutes > 1 ? "s" : ""}`;
  }
  return `Runs on cron: ${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ""}`;
}

export async function toggleCronJob(state: CronState, job: CronJob, enabled: boolean) {
  if (!state.client || !state.connected || state.cronBusy) {
    return;
  }
  state.cronBusy = true;
  state.cronError = null;
  try {
    await state.client.request("cron.update", { id: job.id, patch: { enabled } });
    await loadCronJobs(state);
    await loadCronStatus(state);
  } catch (err) {
    state.cronError = String(err);
  } finally {
    state.cronBusy = false;
  }
}

export async function runCronJob(state: CronState, job: CronJob) {
  if (!state.client || !state.connected || state.cronBusy) {
    return;
  }
  state.cronBusy = true;
  state.cronError = null;
  try {
    await state.client.request("cron.run", { id: job.id, mode: "force" });
    await loadCronRuns(state, job.id);
  } catch (err) {
    state.cronError = String(err);
  } finally {
    state.cronBusy = false;
  }
}

export async function removeCronJob(state: CronState, job: CronJob) {
  if (!state.client || !state.connected || state.cronBusy) {
    return;
  }
  state.cronBusy = true;
  state.cronError = null;
  try {
    await state.client.request("cron.remove", { id: job.id });
    if (state.cronRunsJobId === job.id) {
      state.cronRunsJobId = null;
      state.cronRuns = [];
    }
    await loadCronJobs(state);
    await loadCronStatus(state);
  } catch (err) {
    state.cronError = String(err);
  } finally {
    state.cronBusy = false;
  }
}

export async function loadCronRuns(state: CronState, jobId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const res = await state.client.request("cron.runs", {
      id: jobId,
      limit: 50,
    });
    state.cronRunsJobId = jobId;
    state.cronRuns = Array.isArray(res.entries) ? res.entries : [];
  } catch (err) {
    state.cronError = String(err);
  }
}
