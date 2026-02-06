import {
  loadModelCatalog,
  type ModelCatalogEntry,
  resetModelCatalogCacheForTest,
} from "../agents/model-catalog.js";
import { loadConfig } from "../config/config.js";

export type GatewayModelChoice = ModelCatalogEntry;

/**
 * Maps provider IDs to their corresponding environment variable names for model overrides.
 * When a secret like OPENAI_MODEL is set, that model is added to the catalog.
 */
const MODEL_OVERRIDE_ENV_MAP: Record<string, string> = {
  openai: "OPENAI_MODEL",
  openrouter: "OPENROUTER_MODEL",
  "google-vertex": "VERTEX_MODEL",
  lmstudio: "LMSTUDIO_MODEL",
  google: "GEMINI_MODEL",
  anthropic: "ANTHROPIC_MODEL",
};

/**
 * Gets models specified via environment variables that should be added to the catalog.
 */
function getEnvOverrideModels(catalog: ModelCatalogEntry[]): ModelCatalogEntry[] {
  const envModels: ModelCatalogEntry[] = [];
  const catalogKeys = new Set(catalog.map((e) => `${e.provider}/${e.id}`));

  for (const [provider, envVar] of Object.entries(MODEL_OVERRIDE_ENV_MAP)) {
    const model = process.env[envVar]?.trim();
    if (model) {
      const key = `${provider}/${model}`;
      // Only add if not already in catalog
      if (!catalogKeys.has(key)) {
        envModels.push({
          id: model,
          name: model,
          provider,
        });
      }
    }
  }

  return envModels;
}

// Test-only escape hatch: model catalog is cached at module scope for the
// process lifetime, which is fine for the real gateway daemon, but makes
// isolated unit tests harder. Keep this intentionally obscure.
export function __resetModelCatalogCacheForTest() {
  resetModelCatalogCacheForTest();
}

export async function loadGatewayModelCatalog(): Promise<GatewayModelChoice[]> {
  const catalog = await loadModelCatalog({ config: loadConfig() });
  const envModels = getEnvOverrideModels(catalog);
  if (envModels.length > 0) {
    return [...catalog, ...envModels];
  }
  return catalog;
}
