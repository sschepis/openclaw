import type { GatewayBrowserClient } from "../gateway";
import type { SkillStatusReport } from "../types";

export type SkillsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  skillsLoading: boolean;
  skillsReport: SkillStatusReport | null;
  skillsError: string | null;
  skillsBusyKey: string | null;
  skillEdits: Record<string, string>;
  skillMessages: SkillMessageMap;
  registryLoading: boolean;
  registryError: string | null;
  registryList: RegistrySkill[];
  skillsExpandedGroups: Set<string>;
  skillsExpandedSkill: string | null;
};

export type RegistrySkill = {
  id: string;
  name: string;
  description: string;
  author: string;
};

export type SkillMessage = {
  kind: "success" | "error";
  message: string;
};

export type SkillMessageMap = Record<string, SkillMessage>;

type LoadSkillsOptions = {
  clearMessages?: boolean;
};

function setSkillMessage(state: SkillsState, key: string, message?: SkillMessage) {
  if (!key.trim()) {
    return;
  }
  const next = { ...state.skillMessages };
  if (message) {
    next[key] = message;
  } else {
    delete next[key];
  }
  state.skillMessages = next;
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export async function loadSkills(state: SkillsState, options?: LoadSkillsOptions) {
  if (options?.clearMessages && Object.keys(state.skillMessages).length > 0) {
    state.skillMessages = {};
  }
  if (!state.client || !state.connected) {
    return;
  }
  if (state.skillsLoading) {
    return;
  }
  state.skillsLoading = true;
  state.skillsError = null;
  try {
    const res = await state.client.request("skills.status", {});
    if (res) {
      state.skillsReport = res as SkillStatusReport;
    }
  } catch (err) {
    state.skillsError = getErrorMessage(err);
  } finally {
    state.skillsLoading = false;
  }
}

export function updateSkillEdit(state: SkillsState, skillKey: string, value: string) {
  state.skillEdits = { ...state.skillEdits, [skillKey]: value };
}

export async function updateSkillEnabled(state: SkillsState, skillKey: string, enabled: boolean) {
  if (!state.client || !state.connected) {
    return;
  }
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    await state.client.request("skills.update", { skillKey, enabled });
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: enabled ? "Skill enabled" : "Skill disabled",
    });
  } catch (err) {
    const message = getErrorMessage(err);
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function saveSkillApiKey(state: SkillsState, skillKey: string) {
  if (!state.client || !state.connected) {
    return;
  }
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    const apiKey = state.skillEdits[skillKey] ?? "";
    await state.client.request("skills.update", { skillKey, apiKey });
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: "API key saved",
    });
  } catch (err) {
    const message = getErrorMessage(err);
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function installSkill(
  state: SkillsState,
  skillKey: string,
  name: string,
  installId: string,
) {
  if (!state.client || !state.connected) {
    return;
  }
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- client.request returns unknown, assertion is needed
    const result = (await state.client.request("skills.install", {
      name,
      installId,
      timeoutMs: 120000,
    })) as { message?: string };
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: result?.message ?? "Installed",
    });
  } catch (err) {
    const message = getErrorMessage(err);
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function loadSkillsRegistry(state: SkillsState) {
  state.registryLoading = true;
  state.registryError = null;
  try {
    // Mock fetch
    await new Promise((resolve) => setTimeout(resolve, 500));
    state.registryList = [
      { id: "weather", name: "Weather", description: "Get weather forecasts", author: "OpenClaw" },
      { id: "news", name: "News", description: "Search latest news", author: "OpenClaw" },
      {
        id: "calculator",
        name: "Calculator",
        description: "Perform math calculations",
        author: "OpenClaw",
      },
    ];
  } catch (err) {
    state.registryError = String(err);
  } finally {
    state.registryLoading = false;
  }
}

export function toggleSkillGroup(state: SkillsState, group: string) {
  const next = new Set(state.skillsExpandedGroups);
  if (next.has(group)) {
    next.delete(group);
  } else {
    next.add(group);
  }
  state.skillsExpandedGroups = next;
}

export function toggleSkillExpanded(state: SkillsState, skillKey: string | null) {
  state.skillsExpandedSkill = skillKey;
}
