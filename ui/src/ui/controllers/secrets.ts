import type { AppViewState } from "../app-view-state.js";
import type { SecretsListResult } from "../types.js";

export async function loadSecrets(state: AppViewState) {
  if (state.secretsLoading) return;
  state.secretsLoading = true;
  state.secretsError = null;

  try {
    const res = (await state.client?.request("secrets.list")) as SecretsListResult | null;
    state.secretsKeys = res?.keys ?? [];
  } catch (err: any) {
    state.secretsError = String(err);
  } finally {
    state.secretsLoading = false;
  }
}

export async function saveSecret(state: AppViewState, key: string, value: string) {
  if (state.secretsSaving) return;
  state.secretsSaving = true;
  state.secretsError = null;

  try {
    const res = (await state.client?.request("secrets.set", { key, value })) as { ok: boolean };
    if (res?.ok) {
      await loadSecrets(state);
      state.secretsForm = null; // Close form on success
    }
  } catch (err: any) {
    state.secretsError = String(err);
  } finally {
    state.secretsSaving = false;
  }
}

export async function deleteSecret(state: AppViewState, key: string) {
  if (state.secretsSaving) return;
  
  if (!confirm(`Are you sure you want to delete secret "${key}"? This cannot be undone.`)) {
    return;
  }

  state.secretsSaving = true;
  state.secretsError = null;

  try {
    const res = (await state.client?.request("secrets.delete", { key })) as { ok: boolean };
    if (res?.ok) {
      await loadSecrets(state);
    }
  } catch (err: any) {
    state.secretsError = String(err);
  } finally {
    state.secretsSaving = false;
  }
}

export function openSecretForm(state: AppViewState, key?: string) {
  state.secretsForm = {
    key: key ?? "",
    value: "",
  };
  state.secretsError = null;
}

export function closeSecretForm(state: AppViewState) {
  state.secretsForm = null;
  state.secretsError = null;
}

export function updateSecretForm(state: AppViewState, patch: Partial<{ key: string; value: string }>) {
  if (!state.secretsForm) return;
  state.secretsForm = { ...state.secretsForm, ...patch };
}
