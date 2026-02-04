import { callGatewayTool } from "../agents/tools/gateway.js";

export class SecretsAgentClient {
  /**
   * Resolve a secret. If missing, it will request it from the user via the Gateway.
   * @param key The secret key (e.g. "GITHUB_TOKEN")
   * @param description Optional description for the user prompt
   */
  async getSecret(key: string, description?: string): Promise<string> {
    // 1. Try to get specific secret
    try {
      const result = await callGatewayTool<{ value: string }>(
        "secrets.get",
        { timeoutMs: 5000 },
        { key },
      );
      if (result?.value) {
        return result.value;
      }
    } catch {
      // Ignore error, proceed to request
    }

    // 2. Request secret (blocks until user provides it or timeout)
    const result = await callGatewayTool<{ value: string }>(
      "secrets.request",
      { timeoutMs: 600000 }, // Long timeout for user interaction
      { key, description },
    );

    if (!result?.value) {
      throw new Error(`Secret '${key}' was not provided.`);
    }

    return result.value;
  }
}

export const secretsClient = new SecretsAgentClient();
