/**
 * lib/queries/secrets.ts
 *
 * Access-controlled server-side queries for the Secret model.
 *
 * Every function enforces the 3-condition rule from lib/queries/access.ts:
 *   1. SUPERADMIN          → unrestricted
 *   2. MODERATOR or above  → unrestricted (role-based access)
 *   3. USER / INTERN       → owner OR explicitly in sharedWith (allowedUserIds)
 *
 * The `encryptedValue` and `iv` columns are intentionally excluded from list
 * queries (getSecretsByProject) — they are only included in the single-record
 * `getSecretById` / `getDecryptedSecretById` calls where the caller explicitly
 * needs the ciphertext.
 */

import { prisma }             from "@/lib/prisma";
import { decryptValue }       from "@/lib/crypto";
import { hasBroadAccess, allowedAccessWhere, type QueryActor } from "./access";

// ---------------------------------------------------------------------------
// Shared select shapes
// ---------------------------------------------------------------------------

/** Columns safe to return in a list — never includes raw ciphertext. */
const LIST_SELECT = {
  id:        true,
  key:       true,
  ownerId:   true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
  project:   { select: { id: true, name: true } },
  owner:     { select: { id: true, name: true, email: true } },
  sharedWith:{ select: { id: true, name: true, email: true } },
} as const;

/** Full columns — includes ciphertext fields needed for decryption. */
const FULL_SELECT = {
  ...LIST_SELECT,
  encryptedValue: true,
  iv:             true,
} as const;

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Fetches all accessible secrets within a project.
 * Ciphertext is excluded — use `getSecretById` when you need to decrypt.
 */
export async function getSecretsByProject(projectId: string, actor: QueryActor) {
  const baseWhere = { projectId };

  if (hasBroadAccess(actor.role)) {
    return prisma.secret.findMany({
      where:   baseWhere,
      select:  LIST_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  return prisma.secret.findMany({
    where:   { ...baseWhere, ...allowedAccessWhere(actor) },
    select:  LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Fetches a single secret by ID with full columns (ciphertext included).
 * Returns `null` when the record does not exist or the actor has no access.
 */
export async function getSecretById(id: string, actor: QueryActor) {
  if (hasBroadAccess(actor.role)) {
    return prisma.secret.findUnique({ where: { id }, select: FULL_SELECT });
  }

  return prisma.secret.findFirst({
    where:  { id, ...allowedAccessWhere(actor) },
    select: FULL_SELECT,
  });
}

/**
 * Fetches a secret and decrypts its value in a single call.
 * Returns `null` when the record does not exist or the actor has no access.
 * Throws if decryption fails (wrong key, tampered data).
 */
export async function getDecryptedSecretById(
  id: string,
  actor: QueryActor,
): Promise<(Awaited<ReturnType<typeof getSecretById>> & { plaintext: string }) | null> {
  const secret = await getSecretById(id, actor);
  if (!secret) return null;

  const plaintext = decryptValue(secret.encryptedValue, secret.iv);
  return { ...secret, plaintext };
}

/**
 * Fetches all secrets the actor owns or has been granted access to,
 * across all projects. Ciphertext excluded.
 */
export async function getAccessibleSecrets(actor: QueryActor) {
  if (hasBroadAccess(actor.role)) {
    return prisma.secret.findMany({
      select:  LIST_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  return prisma.secret.findMany({
    where:   allowedAccessWhere(actor),
    select:  LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });
}
