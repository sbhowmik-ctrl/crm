import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
// AES-256 requires a 32-byte key. We store it as a 64-char hex string in .env.
const KEY_HEX_LENGTH = 64;
const IV_BYTES = 12;  // 96-bit IV is the recommended size for GCM
const AUTH_TAG_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;

  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Add a 64-character hex string to your .env file.\n" +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  if (hex.length !== KEY_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      `ENCRYPTION_KEY must be a ${KEY_HEX_LENGTH}-character hex string (32 bytes). ` +
      `Received a string of length ${hex.length}.`
    );
  }

  return Buffer.from(hex, "hex");
}

export interface EncryptResult {
  /** Hex-encoded ciphertext + auth tag (ciphertext is first, tag is the last 16 bytes). */
  encryptedValue: string;
  /** Hex-encoded 12-byte IV. Store this alongside the encrypted value. */
  iv: string;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param text - The plaintext string to encrypt.
 * @returns An object containing the hex-encoded `encryptedValue` (ciphertext + auth tag)
 *          and the hex-encoded `iv`. Both must be stored to decrypt later.
 */
export function encryptValue(text: string): EncryptResult {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16-byte GCM authentication tag

  // Append the auth tag to the ciphertext so decryptValue only needs encryptedValue + iv.
  const encryptedValue = Buffer.concat([encrypted, authTag]).toString("hex");

  return {
    encryptedValue,
    iv: iv.toString("hex"),
  };
}

/**
 * Decrypts a value that was encrypted with `encryptValue`.
 *
 * @param encryptedValue - Hex-encoded ciphertext + auth tag (as returned by `encryptValue`).
 * @param iv             - Hex-encoded 12-byte IV (as returned by `encryptValue`).
 * @returns The original plaintext string.
 * @throws If the key is wrong, the IV is invalid, or the auth tag fails (data tampered).
 */
export function decryptValue(encryptedValue: string, iv: string): string {
  const key = getKey();
  const ivBuffer = Buffer.from(iv, "hex");

  if (ivBuffer.length !== IV_BYTES) {
    throw new Error(
      `Invalid IV length: expected ${IV_BYTES} bytes, got ${ivBuffer.length}.`
    );
  }

  const encryptedBuffer = Buffer.from(encryptedValue, "hex");

  if (encryptedBuffer.length < AUTH_TAG_BYTES) {
    throw new Error("Encrypted value is too short to contain an auth tag.");
  }

  // Split the stored buffer back into ciphertext and auth tag.
  const ciphertext = encryptedBuffer.subarray(0, encryptedBuffer.length - AUTH_TAG_BYTES);
  const authTag = encryptedBuffer.subarray(encryptedBuffer.length - AUTH_TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTag);

  // If the key, IV, or auth tag don't match, Node throws here — protecting against tampering.
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString("utf8");
}
