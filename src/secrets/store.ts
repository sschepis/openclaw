import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateKey, exportKey, importKey, encrypt, decrypt } from "./encryption.js";

const BASE_DIR = path.join(os.homedir(), ".openclaw");
const MASTER_KEY_PATH = path.join(BASE_DIR, "secrets.key");
const VAULT_PATH = path.join(BASE_DIR, "secrets.enc");

type EncryptedVault = {
  iv: string;
  data: string;
};

type SecretsMap = Record<string, string>; // key -> value

export class SecretsStore {
  private key: CryptoKey | null = null;
  private memoryCache: SecretsMap | null = null;

  async init() {
    await fs.mkdir(BASE_DIR, { recursive: true });
    this.key = await this.loadOrGenerateKey();
  }

  private async loadOrGenerateKey(): Promise<CryptoKey> {
    try {
      const keyData = await fs.readFile(MASTER_KEY_PATH, "utf-8");
      return importKey(keyData.trim());
    } catch {
      // Generate new key
      const key = await generateKey();
      const exported = await exportKey(key);
      await fs.writeFile(MASTER_KEY_PATH, exported, { mode: 0o600 });
      return key;
    }
  }

  private async readVault(): Promise<SecretsMap> {
    if (this.memoryCache) return this.memoryCache;
    if (!this.key) await this.init();
    if (!this.key) throw new Error("Failed to initialize secrets key");

    try {
      const content = await fs.readFile(VAULT_PATH, "utf-8");
      const vault: EncryptedVault = JSON.parse(content);
      const json = await decrypt(vault.data, vault.iv, this.key);
      this.memoryCache = JSON.parse(json);
      return this.memoryCache!;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return {};
      }
      throw err;
    }
  }

  private async writeVault(secrets: SecretsMap): Promise<void> {
    if (!this.key) await this.init();
    if (!this.key) throw new Error("Failed to initialize secrets key");

    this.memoryCache = secrets;
    const json = JSON.stringify(secrets);
    const { iv, data } = await encrypt(json, this.key);

    await fs.writeFile(VAULT_PATH, JSON.stringify({ iv, data }), { mode: 0o600 });
  }

  async get(key: string): Promise<string | undefined> {
    const secrets = await this.readVault();
    return secrets[key];
  }

  async set(key: string, value: string): Promise<void> {
    const secrets = await this.readVault();
    secrets[key] = value;
    await this.writeVault(secrets);
  }

  async delete(key: string): Promise<void> {
    const secrets = await this.readVault();
    delete secrets[key];
    await this.writeVault(secrets);
  }

  async listKeys(): Promise<string[]> {
    const secrets = await this.readVault();
    return Object.keys(secrets);
  }
}

export const globalSecretsStore = new SecretsStore();
