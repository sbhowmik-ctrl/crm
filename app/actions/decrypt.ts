"use server";

import { auth }                        from "@/auth";
import { assertActiveVaultSession }    from "@/lib/session-guards";
import { getDecryptedSecretById, getDecryptedSecretsByProject } from "@/lib/queries/secrets";

export type DecryptResult =
  | { success: true;  plaintext: string }
  | { success: false; error: string };

/**
 * Server Action — decrypts a single secret and returns its plaintext value.
 *
 * Security:
 *  - Session is re-validated on every call (the client cannot forge the role).
 *  - Access control is delegated to getDecryptedSecretById (project scope + admins).
 *  - The plaintext is never stored in the DOM — it only briefly exists in memory
 *    on the server and is then written directly to the client's clipboard.
 */
export async function decryptSecretValue(secretId: string): Promise<DecryptResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) {
    return { success: false, error: vault.error };
  }

  if (!secretId?.trim()) {
    return { success: false, error: "Invalid secret ID." };
  }

  const actor = {
    id:       vault.user.id,
    role:     vault.user.role,
    isActive: vault.user.isActive,
  };

  const secret = await getDecryptedSecretById(secretId.trim(), actor);

  if (!secret) {
    return {
      success: false,
      error: "Secret not found or you do not have access to it.",
    };
  }

  return { success: true, plaintext: secret.plaintext };
}

// ---------------------------------------------------------------------------
// Decrypt all secrets in a project (bulk .env export)
// ---------------------------------------------------------------------------

export type DecryptAllResult =
  | { success: true;  entries: { key: string; plaintext: string }[] }
  | { success: false; error: string };

/**
 * Server Action — decrypts every accessible secret in a project and returns
 * them as key/plaintext pairs so the client can format and copy them as a
 * .env file.
 *
 * Same scope as list queries — secrets outside the actor’s access are excluded.
 */
export async function decryptAllProjectSecrets(projectId: string): Promise<DecryptAllResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) {
    return { success: false, error: vault.error };
  }

  if (!projectId?.trim()) {
    return { success: false, error: "Invalid project ID." };
  }

  const actor = {
    id:       vault.user.id,
    role:     vault.user.role,
    isActive: vault.user.isActive,
  };

  const entries = await getDecryptedSecretsByProject(projectId.trim(), actor);

  if (entries.length === 0) {
    return { success: false, error: "No accessible secrets found in this project." };
  }

  return { success: true, entries };
}
