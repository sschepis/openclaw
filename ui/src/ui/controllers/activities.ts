import type { GatewayBrowserClient } from "../gateway.js";
import type { ActivitiesListResult } from "../types.js";

export type ActivitiesState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  activitiesLoading: boolean;
  activitiesList: ActivitiesListResult | null;
  activitiesError: string | null;
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
): Promise<{ ok: boolean; promptSent?: string; error?: string }> {
  if (!state.client || !state.connected) {
    return { ok: false, error: "Not connected" };
  }

  try {
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
