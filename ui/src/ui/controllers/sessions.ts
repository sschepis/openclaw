import type { GatewayBrowserClient } from "../gateway";
import type { SessionsListResult } from "../types";
import type { SessionDeleteConfirmState } from "../ui-types";
import { toNumber } from "../format";
import { GLOBAL_SESSION_KEY } from "../types";

export type SessionsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionsLoading: boolean;
  sessionsResult: SessionsListResult | null;
  sessionsError: string | null;
  sessionsFilterActive: string;
  sessionsFilterLimit: string;
  sessionsIncludeGlobal: boolean;
  sessionsIncludeUnknown: boolean;
  sessionDeleteConfirm: SessionDeleteConfirmState | null;
};

export async function loadSessions(
  state: SessionsState,
  overrides?: {
    activeMinutes?: number;
    limit?: number;
    includeGlobal?: boolean;
    includeUnknown?: boolean;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.sessionsLoading) {
    return;
  }
  state.sessionsLoading = true;
  state.sessionsError = null;
  try {
    const includeGlobal = overrides?.includeGlobal ?? state.sessionsIncludeGlobal;
    const includeUnknown = overrides?.includeUnknown ?? state.sessionsIncludeUnknown;
    const activeMinutes = overrides?.activeMinutes ?? toNumber(state.sessionsFilterActive, 0);
    const limit = overrides?.limit ?? toNumber(state.sessionsFilterLimit, 0);
    const params: Record<string, unknown> = {
      includeGlobal,
      includeUnknown,
    };
    if (activeMinutes > 0) {
      params.activeMinutes = activeMinutes;
    }
    if (limit > 0) {
      params.limit = limit;
    }
    const res = await state.client.request("sessions.list", params);
    if (res) {
      // oxlint-disable-next-line typescript/no-explicit-any -- gateway response type cast
      state.sessionsResult = res as SessionsListResult;
    }
  } catch (err) {
    state.sessionsError = String(err);
  } finally {
    state.sessionsLoading = false;
  }
}

export async function patchSession(
  state: SessionsState,
  key: string,
  patch: {
    label?: string | null;
    thinkingLevel?: string | null;
    verboseLevel?: string | null;
    reasoningLevel?: string | null;
    model?: string | null;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  const params: Record<string, unknown> = { key };
  if ("label" in patch) {
    params.label = patch.label;
  }
  if ("thinkingLevel" in patch) {
    params.thinkingLevel = patch.thinkingLevel;
  }
  if ("verboseLevel" in patch) {
    params.verboseLevel = patch.verboseLevel;
  }
  if ("reasoningLevel" in patch) {
    params.reasoningLevel = patch.reasoningLevel;
  }
  if ("model" in patch) {
    params.model = patch.model;
  }
  try {
    await state.client.request("sessions.patch", params);
    await loadSessions(state);
  } catch (err) {
    state.sessionsError = String(err);
  }
}

/**
 * Check if a session key represents the protected Global session.
 */
export function isGlobalSessionKey(key: string): boolean {
  return key === GLOBAL_SESSION_KEY;
}

/**
 * Legacy delete that immediately deletes without showing child sessions.
 * Now redirects to initiateDeleteSession to show the confirmation modal.
 */
export async function deleteSession(state: SessionsState, key: string) {
  // Use the new modal-based confirmation flow
  await initiateDeleteSession(state, key);
}

/**
 * Get display name for a session, falling back to the full key.
 */
function getSessionDisplayName(session: { label?: string | null; key: string }): string {
  if (session.label && session.label.trim()) {
    return session.label.trim();
  }
  // Return full key when no label is set
  return session.key;
}

/**
 * Initiate the delete confirmation flow. Opens the modal and loads child sessions.
 */
export async function initiateDeleteSession(state: SessionsState, key: string) {
  if (!state.client || !state.connected) {
    return;
  }
  // Prevent deletion of the Global session
  if (isGlobalSessionKey(key)) {
    window.alert("The Global session cannot be deleted.");
    return;
  }

  // Find display name from current sessions list
  let displayName = key;
  if (state.sessionsResult?.sessions) {
    const found = state.sessionsResult.sessions.find((s) => s.key === key);
    if (found) {
      displayName = getSessionDisplayName(found);
    }
  }

  // Open modal with loading state
  state.sessionDeleteConfirm = {
    sessionKey: key,
    displayName,
    loading: true,
    childSessions: [],
    deleting: false,
    error: null,
  };

  // Query for child sessions (sessions spawned by this session)
  try {
    // Add a timeout to prevent hanging indefinitely if gateway is slow
    const listPromise = state.client.request("sessions.list", {
      spawnedBy: key,
      includeGlobal: false,
      includeUnknown: true,
    });
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Request timed out")), 5000);
    });

    const res = await Promise.race([listPromise, timeoutPromise]);
    
    const childSessions: Array<{ key: string; displayName: string }> = [];
    if (res && typeof res === "object" && "sessions" in res) {
      const sessions = (res as { sessions: Array<{ key: string; label?: string | null }> })
        .sessions;
      for (const s of sessions) {
        childSessions.push({
          key: s.key,
          displayName: getSessionDisplayName(s),
        });
      }
    }
    // Must check again because state could have been modified
    if (state.sessionDeleteConfirm) {
      state.sessionDeleteConfirm = {
        sessionKey: state.sessionDeleteConfirm.sessionKey,
        displayName: state.sessionDeleteConfirm.displayName,
        loading: false,
        childSessions,
        deleting: false,
        error: null,
      };
    }
  } catch (err) {
    if (state.sessionDeleteConfirm) {
      state.sessionDeleteConfirm = {
        sessionKey: state.sessionDeleteConfirm.sessionKey,
        displayName: state.sessionDeleteConfirm.displayName,
        loading: false,
        childSessions: state.sessionDeleteConfirm.childSessions,
        deleting: false,
        error: `Failed to load child sessions: ${String(err)}`,
      };
    }
  }
}

/**
 * Execute the deletion of the session and all its child sessions.
 */
export async function executeDeleteSession(state: SessionsState) {
  if (!state.client || !state.connected) {
    return;
  }
  const confirm = state.sessionDeleteConfirm;
  if (!confirm) {
    return;
  }

  const { sessionKey, childSessions, displayName } = confirm;

  state.sessionDeleteConfirm = {
    sessionKey,
    displayName,
    loading: false,
    childSessions,
    deleting: true,
    error: null,
  };

  try {
    // Delete child sessions first
    for (const child of childSessions) {
      await state.client.request("sessions.delete", { key: child.key, deleteTranscript: true });
    }
    // Delete the parent session
    await state.client.request("sessions.delete", { key: sessionKey, deleteTranscript: true });

    // Close modal and refresh
    state.sessionDeleteConfirm = null;
    await loadSessions(state);
  } catch (err) {
    // Re-read in case state changed
    const current = state.sessionDeleteConfirm;
    if (current) {
      state.sessionDeleteConfirm = {
        sessionKey: current.sessionKey,
        displayName: current.displayName,
        loading: false,
        childSessions: current.childSessions,
        deleting: false,
        error: `Failed to delete session: ${String(err)}`,
      };
    }
  }
}

/**
 * Cancel the delete confirmation and close the modal.
 */
export function cancelDeleteSession(state: SessionsState) {
  state.sessionDeleteConfirm = null;
}

/**
 * Archive a session by setting its archived flag to true.
 * This removes the session from the default chat list without deleting it.
 */
export async function archiveSession(state: SessionsState, key: string) {
  if (!state.client || !state.connected) {
    return;
  }
  // Prevent archiving the Global session
  if (isGlobalSessionKey(key)) {
    window.alert("The Global session cannot be archived.");
    return;
  }

  try {
    await state.client.request("sessions.patch", { key, archived: true });
    await loadSessions(state);
  } catch (err) {
    state.sessionsError = String(err);
  }
}
