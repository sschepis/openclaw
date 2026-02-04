import { webcrypto } from "node:crypto";

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for GCM

export async function generateKey(): Promise<CryptoKey> {
  return webcrypto.subtle.generateKey(
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true,
    ["encrypt", "decrypt"],
  ) as unknown as Promise<CryptoKey>;
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await webcrypto.subtle.exportKey("raw", key);
  return Buffer.from(exported).toString("base64");
}

export async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = Buffer.from(base64Key, "base64");
  return webcrypto.subtle.importKey("raw", raw, ALGORITHM, true, [
    "encrypt",
    "decrypt",
  ]) as unknown as Promise<CryptoKey>;
}

export async function encrypt(text: string, key: CryptoKey): Promise<{ iv: string; data: string }> {
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(text);

  const encrypted = await webcrypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv,
    },
    key,
    encoded,
  );

  return {
    iv: Buffer.from(iv).toString("base64"),
    data: Buffer.from(encrypted).toString("base64"),
  };
}

export async function decrypt(
  encryptedData: string,
  ivBase64: string,
  key: CryptoKey,
): Promise<string> {
  const iv = Buffer.from(ivBase64, "base64");
  const data = Buffer.from(encryptedData, "base64");

  const decrypted = await webcrypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv,
    },
    key,
    data,
  );

  return new TextDecoder().decode(decrypted);
}
