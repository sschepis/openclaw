/**
 * Secrets to Environment Injection
 *
 * This module provides functionality to inject secrets from the encrypted vault
 * into process.env, enabling provider configuration via secrets.
 *
 * Supported secrets:
 * - API Keys: OPENAI_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY, etc.
 * - Model overrides: OPENAI_MODEL, OPENROUTER_MODEL, VERTEX_MODEL, LMSTUDIO_MODEL
 * - Provider config: LMSTUDIO_URL, VERTEX_AUTH_JSON, VERTEX_PROJECT_ID, VERTEX_REGION
 */

import { globalSecretsStore } from "./store.js";

/**
 * List of secret keys that should be injected into process.env.
 * These are keys that the provider configuration system recognizes.
 */
const INJECTABLE_SECRET_KEYS = [
  // API Keys for providers
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "XAI_API_KEY",
  "DEEPGRAM_API_KEY",
  "CEREBRAS_API_KEY",
  "MOONSHOT_API_KEY",
  "MINIMAX_API_KEY",
  "XIAOMI_API_KEY",
  "SYNTHETIC_API_KEY",
  "VENICE_API_KEY",
  "MISTRAL_API_KEY",
  "OPENCODE_API_KEY",
  "AI_GATEWAY_API_KEY",
  // GitHub/Copilot tokens
  "COPILOT_GITHUB_TOKEN",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  // AWS credentials
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_BEARER_TOKEN_BEDROCK",
  "AWS_PROFILE",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  // Model overrides (sets default model for provider when used with API key)
  "OPENAI_MODEL",
  "OPENROUTER_MODEL",
  "VERTEX_MODEL",
  "LMSTUDIO_MODEL",
  "GEMINI_MODEL",
  "ANTHROPIC_MODEL",
  // LMStudio configuration
  "LMSTUDIO_URL",
  // Google Vertex AI configuration
  "VERTEX_AUTH_JSON",
  "VERTEX_PROJECT_ID",
  "VERTEX_REGION",
  "GOOGLE_APPLICATION_CREDENTIALS",
  // OAuth tokens
  "ANTHROPIC_OAUTH_TOKEN",
  "CHUTES_OAUTH_TOKEN",
  "QWEN_OAUTH_TOKEN",
  "MINIMAX_OAUTH_TOKEN",
];

/**
 * Injected secrets are tracked so they can be cleaned up if needed.
 */
const injectedKeys = new Set<string>();

/**
 * Injects secrets from the encrypted vault into process.env.
 * Only injects secrets that are:
 * 1. Present in the vault
 * 2. In the list of injectable keys
 * 3. Not already set in process.env (to avoid overwriting explicit env vars)
 *
 * @param options.overwrite If true, overwrite existing env vars. Default: false
 * @returns List of keys that were injected
 */
export async function injectSecretsToEnv(options: { overwrite?: boolean } = {}): Promise<string[]> {
  const { overwrite = false } = options;
  const injected: string[] = [];

  try {
    const keys = await globalSecretsStore.listKeys();

    for (const key of keys) {
      // Only inject known provider-related secrets
      if (!INJECTABLE_SECRET_KEYS.includes(key)) {
        continue;
      }

      // Don't overwrite existing env vars unless explicitly requested
      if (!overwrite && process.env[key]) {
        continue;
      }

      const value = await globalSecretsStore.get(key);
      if (value) {
        process.env[key] = value;
        injectedKeys.add(key);
        injected.push(key);
      }
    }
  } catch {
    // Silently fail if secrets store is not accessible
    // This allows the system to work without secrets configured
  }

  return injected;
}

/**
 * Removes previously injected secrets from process.env.
 * Useful for testing or cleanup.
 */
export function clearInjectedSecrets(): void {
  for (const key of injectedKeys) {
    delete process.env[key];
  }
  injectedKeys.clear();
}

/**
 * Gets the list of secret keys that are currently injected.
 */
export function getInjectedSecretKeys(): string[] {
  return Array.from(injectedKeys);
}

/**
 * Checks if a specific secret key is injectable (recognized by the system).
 */
export function isInjectableSecretKey(key: string): boolean {
  return INJECTABLE_SECRET_KEYS.includes(key);
}

/**
 * Gets the full list of injectable secret keys.
 * Useful for UI hints about which secrets enable providers.
 */
export function getInjectableSecretKeys(): string[] {
  return [...INJECTABLE_SECRET_KEYS];
}
