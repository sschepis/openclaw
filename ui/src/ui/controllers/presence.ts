import type { GatewayBrowserClient } from "../gateway";
import type { PresenceEntry, StatusSummary } from "../types";

export type PresenceState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  presenceLoading: boolean;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: StatusSummary | null;
};

export async function loadPresence(state: PresenceState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.presenceLoading) {
    return;
  }
  state.presenceLoading = true;
  state.presenceError = null;
  state.presenceStatus = null;
  try {
    const res = await state.client.request("system-presence", {});
    if (Array.isArray(res)) {
      state.presenceEntries = res;
      // presenceStatus is for StatusSummary objects, not strings
      // If no instances, the UI should show presenceEntries.length === 0
      state.presenceStatus = null;
    } else {
      state.presenceEntries = [];
      state.presenceStatus = null;
    }
  } catch (err) {
    state.presenceError = String(err);
  } finally {
    state.presenceLoading = false;
  }
}
