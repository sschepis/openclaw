import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export type SecretRequest = {
  key: string;
  description?: string;
  source?: string; // agentId or similar
};

export type SecretRequestRecord = {
  id: string;
  request: SecretRequest;
  createdAtMs: number;
  expiresAtMs: number;
  resolve?: (value: string | null) => void;
  resolved: boolean;
  value?: string | null;
};

export class SecretsInteractionManager extends EventEmitter {
  private pending = new Map<string, SecretRequestRecord>();

  create(request: SecretRequest, timeoutMs: number): SecretRequestRecord {
    const id = randomUUID();
    const now = Date.now();
    const record: SecretRequestRecord = {
      id,
      request,
      createdAtMs: now,
      expiresAtMs: now + timeoutMs,
      resolved: false,
    };
    this.pending.set(id, record);

    setTimeout(() => {
      if (!record.resolved) {
        this.resolve(id, null); // Timeout
      }
    }, timeoutMs);

    return record;
  }

  async waitForResolution(id: string): Promise<string | null> {
    const record = this.pending.get(id);
    if (!record) return null;
    if (record.resolved) return record.value ?? null;

    return new Promise((resolve) => {
      record.resolve = resolve;
    });
  }

  resolve(id: string, value: string | null): boolean {
    const record = this.pending.get(id);
    if (!record || record.resolved) return false;

    record.resolved = true;
    record.value = value;
    this.pending.delete(id);

    if (record.resolve) {
      record.resolve(value);
    }

    return true;
  }

  getSnapshot(id: string): SecretRequestRecord | undefined {
    return this.pending.get(id);
  }
}
