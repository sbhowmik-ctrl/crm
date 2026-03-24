/**
 * lib/secret-cipher.ts
 *
 * Server-side AES-256-GCM encryption for secret values.
 *
 * Unlike lib/crypto.ts (which returns { encryptedValue, iv } separately for
 * Prisma storage), these functions return and accept a single opaque string —
 * the "hash" — by packing the IV, ciphertext, and auth tag together:
 *
 *   hash = base64url( iv[12 B] || ciphertext[n B] || authTag[16 B] )
 *
 * This makes it easy to store or transmit a secret as one self-contained value.
 *
 * Requires MASTER_KEY in .env — a 64-character hex string (32 bytes).
 * Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM     = "aes-256-gcm";
const KEY_HEX_LEN   = 64; // 32 bytes expressed as hex
const IV_BYTES      = 12; // 96-bit IV — NIST recommendation for GCM
const AUTH_TAG_BYTES = 16; // 128-bit authentication tag

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getMasterKey(): Buffer {
  const hex = process.env.MASTER_KEY;

  if (!hex) {
    throw new Error(
      "MASTER_KEY is not set.\n" +
      "Add a 64-character hex string to your .env file under MASTER_KEY.\n" +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  if (hex.length !== KEY_HEX_LEN || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      `MASTER_KEY must be exactly ${KEY_HEX_LEN} hex characters (32 bytes). ` +
      `Got ${hex.length} characters.`
    );
  }

  return Buffer.from(hex, "hex");
}

/** Encodes a Buffer to a URL-safe base64 string (no padding, no +/). */
function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes a base64url string back to a Buffer. */
function fromBase64Url(str: string): Buffer {
  // Re-add stripped padding before decoding.
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padding), "base64");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypts a plaintext string using AES-256-GCM with the MASTER_KEY.
 *
 * @param text - The plaintext to encrypt.
 * @returns A single base64url-encoded string containing the IV, ciphertext,
 *          and GCM auth tag — everything needed to decrypt later.
 */
export function encryptSecret(text: string): string {
  const key = getMasterKey();
  const iv  = randomBytes(IV_BYTES);

  const cipher    = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag   = cipher.getAuthTag();

  // Pack: iv (12 B) || ciphertext (n B) || authTag (16 B) → single base64url string.
  const payload = Buffer.concat([iv, encrypted, authTag]);
  return toBase64Url(payload);
}

/**
 * Decrypts a hash produced by `encryptSecret`.
 *
 * @param hash - The base64url string returned by `encryptSecret`.
 * @returns The original plaintext string.
 * @throws If the hash is malformed, the key is wrong, or the auth tag
 *         verification fails (indicating data corruption or tampering).
 */
export function decryptSecret(hash: string): string {
  const key     = getMasterKey();
  const payload = fromBase64Url(hash);

  const minLength = IV_BYTES + AUTH_TAG_BYTES; // 28 bytes minimum (empty plaintext)
  if (payload.length < minLength) {
    throw new Error(
      `Hash is too short to be valid. Expected at least ${minLength} bytes after decoding, ` +
      `got ${payload.length}.`
    );
  }

  // Unpack: first 12 bytes = IV, last 16 bytes = auth tag, middle = ciphertext.
  const iv         = payload.subarray(0, IV_BYTES);
  const authTag    = payload.subarray(payload.length - AUTH_TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES, payload.length - AUTH_TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  // Node throws ERR_CRYPTO_GCM_AUTH_TAG_MISMATCH here if anything has been tampered with.
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString("utf8");
}
