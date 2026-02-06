import { randomUUID } from "node:crypto";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { runEmbeddedPiAgent } from "../../agents/pi-embedded-runner.js";
import { updateSessionStore } from "../../config/sessions.js";
import { getChildLogger } from "../../logging.js";

const log = getChildLogger({ module: "session-title" });

export async function generateSessionTitle(params: {
  sessionKey: string;
  storePath: string;
  userMessage: string;
  agentId: string;
  agentDir: string;
  config: OpenClawConfig;
  provider?: string;
  model?: string;
  defaultProvider: string;
  defaultModel: string;
}) {
  const {
    sessionKey,
    storePath,
    userMessage,
    agentDir,
    config,
    provider,
    model,
    defaultProvider,
    defaultModel,
  } = params;

  // Unused params prefixed with underscore to satisfy linter
  void params.agentId;

  // Don't generate title for very short messages
  if (userMessage.length < 5) {
    return;
  }

  const prompt = `Generate a concise title (3-6 words) for a chat session starting with this message: "${userMessage}". Return ONLY the title text, no quotes or prefixes.`;

  try {
    const titleSessionId = `title-${randomUUID()}`;

    // Use the session's model/provider to ensure we have auth
    // Ideally we'd pick a cheaper model, but we can't guarantee auth availability for arbitrary models

    const result = await runEmbeddedPiAgent({
      runId: titleSessionId,
      agentDir,
      sessionId: titleSessionId,
      sessionKey: `title:${sessionKey}`,
      messageProvider: "system",
      sessionFile: `/tmp/openclaw-title-${titleSessionId}.json`,
      workspaceDir: "/tmp",
      config,
      provider: provider || defaultProvider,
      model: model || defaultModel,
      prompt,
      disableTools: true,
      thinkLevel: "off",
      verboseLevel: "off",
      timeoutMs: 30000,
    });

    let title = "";
    if (result.payloads && result.payloads.length > 0) {
      title = result.payloads
        .filter((p) => p.text && !p.isError)
        .map((p) => p.text)
        .join(" ")
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\.$/, ""); // Remove trailing dot
    }

    if (title && title.length > 2 && title.length < 100) {
      await updateSessionStore(storePath, (store) => {
        const entry = store[sessionKey];
        // Only update if still missing display name
        if (entry && !entry.displayName) {
          entry.displayName = title;
          entry.updatedAt = Date.now();
        }
      });
      log.info({ sessionKey, title }, "Generated session title");
    }
  } catch (err) {
    log.warn({ err: String(err), sessionKey }, "Failed to generate session title");
  }
}
