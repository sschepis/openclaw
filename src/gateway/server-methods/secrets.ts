import type { GatewayRequestHandlers } from "./types.js";
import { globalSecretsStore } from "../../secrets/store.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { SecretsInteractionManager } from "../secrets-interaction-manager.js";

export function createSecretsHandlers(
  interactionManager: SecretsInteractionManager,
): GatewayRequestHandlers {
  return {
    "secrets.get": async ({ params, respond }) => {
      const p = params as { key: string };
      if (typeof p.key !== "string") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing key"));
        return;
      }
      try {
        const value = await globalSecretsStore.get(p.key);
        respond(true, { value: value ?? null });
      } catch (err: unknown) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
        );
      }
    },

    "secrets.request": async ({ params, respond, context }) => {
      const p = params as { key: string; description?: string; timeoutMs?: number };
      if (typeof p.key !== "string") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing key"));
        return;
      }

      // 1. Check if we already have it (race condition check)
      const existing = await globalSecretsStore.get(p.key);
      if (existing) {
        respond(true, { value: existing });
        return;
      }

      // 2. Start interaction
      const timeoutMs = typeof p.timeoutMs === "number" ? p.timeoutMs : 300_000;
      const record = interactionManager.create(
        { key: p.key, description: p.description },
        timeoutMs,
      );

      // 3. Broadcast event to UI
      context.broadcast(
        "secrets.requested",
        {
          id: record.id,
          key: record.request.key,
          description: record.request.description,
          expiresAtMs: record.expiresAtMs,
        },
        { dropIfSlow: false }, // Important event
      );

      // 4. Wait
      const value = await interactionManager.waitForResolution(record.id);

      if (value) {
        // Auto-save to store
        await globalSecretsStore.set(p.key, value);
        respond(true, { value });
      } else {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "request denied or timed out"),
        );
      }
    },

    "secrets.resolve": async ({ params, respond, context }) => {
      const p = params as { id: string; value: string | null };
      if (typeof p.id !== "string") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing id"));
        return;
      }

      const ok = interactionManager.resolve(p.id, p.value);
      if (!ok) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "unknown or expired request id"),
        );
        return;
      }

      context.broadcast("secrets.resolved", { id: p.id, success: !!p.value });
      respond(true, { ok: true });
    },

    "secrets.list": async ({ respond }) => {
      // Only return keys, not values!
      const keys = await globalSecretsStore.listKeys();
      respond(true, { keys });
    },

    "secrets.set": async ({ params, respond }) => {
      const p = params as { key: string; value: string };
      if (typeof p.key !== "string" || typeof p.value !== "string") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing key or value"));
        return;
      }
      try {
        await globalSecretsStore.set(p.key, p.value);
        respond(true, { ok: true });
      } catch (err: unknown) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
        );
      }
    },

    "secrets.delete": async ({ params, respond }) => {
      const p = params as { key: string };
      if (typeof p.key !== "string") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing key"));
        return;
      }
      try {
        await globalSecretsStore.delete(p.key);
        respond(true, { ok: true });
      } catch (err: unknown) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
        );
      }
    },
  };
}
