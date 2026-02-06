import type { GatewayBrowserClient } from "../gateway.js";
import type { ActivitiesListResult } from "../types.js";

export type ActivitiesState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  activitiesLoading: boolean;
  activitiesList: ActivitiesListResult | null;
  activitiesError: string | null;
};

export type ActivityActionResult = {
  ok: boolean;
  promptSent?: string;
  error?: string;
};

export async function loadActivities(
  state: ActivitiesState,
  options?: {
    activeMinutes?: number;
    limit?: number;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.activitiesLoading) {
    return;
  }
  state.activitiesLoading = true;
  state.activitiesError = null;
  try {
    const params: Record<string, unknown> = {
      activeMinutes: options?.activeMinutes ?? 60,
      limit: options?.limit ?? 50,
    };
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- client.request returns unknown, assertion is needed
    const res = (await state.client.request(
      "activities.list",
      params,
    )) as ActivitiesListResult | null;
    state.activitiesList = res;
  } catch (err) {
    state.activitiesError = String(err);
  } finally {
    state.activitiesLoading = false;
  }
}

export async function executeAction(
  state: ActivitiesState,
  sessionKey: string,
  actionId: string,
  parameters?: Record<string, unknown>,
): Promise<ActivityActionResult> {
  if (!state.client || !state.connected) {
    return { ok: false, error: "Not connected" };
  }

  try {
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- client.request returns unknown, assertion is needed
    const res = (await state.client.request("activities.execute", {
      key: sessionKey,
      actionId,
      parameters,
    })) as { ok: boolean; promptSent?: string } | null;

    // Refresh activities after action
    await loadActivities(state);

    return { ok: res?.ok ?? false, promptSent: res?.promptSent };
  } catch (err) {
    state.activitiesError = String(err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Update session model for an activity.
 */
export async function updateActivityModel(
  state: ActivitiesState,
  sessionKey: string,
  model: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!state.client || !state.connected) {
    return { ok: false, error: "Not connected" };
  }

  try {
    await state.client.request("sessions.patch", {
      key: sessionKey,
      patch: { model },
    });
    // Refresh activities after model change
    await loadActivities(state);
    return { ok: true };
  } catch (err) {
    state.activitiesError = String(err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Pause an activity (set abortedLastRun to true).
 */
export async function pauseActivity(
  state: ActivitiesState,
  sessionKey: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!state.client || !state.connected) {
    return { ok: false, error: "Not connected" };
  }

  try {
    await state.client.request("sessions.patch", {
      key: sessionKey,
      patch: { abortedLastRun: true },
    });
    // Refresh activities after pause
    await loadActivities(state);
    return { ok: true };
  } catch (err) {
    state.activitiesError = String(err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Resume an activity (set abortedLastRun to false).
 */
export async function resumeActivity(
  state: ActivitiesState,
  sessionKey: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!state.client || !state.connected) {
    return { ok: false, error: "Not connected" };
  }

  try {
    await state.client.request("sessions.patch", {
      key: sessionKey,
      patch: { abortedLastRun: false },
    });
    // Refresh activities after resume
    await loadActivities(state);
    return { ok: true };
  } catch (err) {
    state.activitiesError = String(err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Delete an activity (delete session).
 */
export async function deleteActivity(
  state: ActivitiesState,
  sessionKey: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!state.client || !state.connected) {
    return { ok: false, error: "Not connected" };
  }

  try {
    await state.client.request("sessions.delete", {
      key: sessionKey,
    });
    // Refresh activities after delete
    await loadActivities(state);
    return { ok: true };
  } catch (err) {
    state.activitiesError = String(err);
    return { ok: false, error: String(err) };
  }
}
