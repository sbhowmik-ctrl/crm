/**
 * lib/queries/secrets.ts
 *
 * Access-controlled server-side queries for the Secret model.
 *
 *   1. ADMIN / SUPERADMIN → all projects, all secrets.
 *   2. MODERATOR          → secrets in expanded tree from any `ProjectMember` assignment.
 *   3. USER / INTERN      → same project tree as in access.ts; **all** secrets in those projects
 *     (no per-secret owner/shared filter). Not siblings outside the ancestor chain.
 *
 * The `encryptedValue` and `iv` columns are intentionally excluded from list
 * queries (getSecretsByProject) — they are only included in the single-record
 * `getSecretById` / `getDecryptedSecretById` calls where the caller explicitly
 * needs the ciphertext.
 */

import { prisma }         from "@/lib/prisma";
import { decryptValue }   from "@/lib/crypto";
import { projectWhereForVaultRead } from "@/lib/vault-entity-status";
import {
  getVaultProjectIdsForActor,
  hasUnrestrictedProjectScope,
  isActorContentBlocked,
  type QueryActor,
} from "./access";

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
  if (isActorContentBlocked(actor)) return [];

  const baseWhere = {
    projectId,
    project: { is: projectWhereForVaultRead(actor) },
  };

  if (hasUnrestrictedProjectScope(actor.role)) {
    return prisma.secret.findMany({
      where:   baseWhere,
      select:  LIST_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  const scope = await getVaultProjectIdsForActor(actor);
  if (!scope.includes(projectId)) return [];

  return prisma.secret.findMany({
    where:   baseWhere,
    select:  LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Fetches a single secret by ID with full columns (ciphertext included).
 * Returns `null` when the record does not exist or the actor has no access.
 */
export async function getSecretById(id: string, actor: QueryActor) {
  if (isActorContentBlocked(actor)) return null;

  const projectRead = projectWhereForVaultRead(actor);

  if (hasUnrestrictedProjectScope(actor.role)) {
    return prisma.secret.findFirst({
      where:  { id, project: { is: projectRead } },
      select: FULL_SELECT,
    });
  }

  const scope = await getVaultProjectIdsForActor(actor);
  if (scope.length === 0) return null;

  return prisma.secret.findFirst({
    where:   { id, projectId: { in: scope }, project: { is: projectRead } },
    select:  FULL_SELECT,
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
 * Fetches and decrypts all accessible secrets within a project in one call.
 * Returns `{ key, plaintext }` pairs ordered alphabetically by key.
 */
export async function getDecryptedSecretsByProject(
  projectId: string,
  actor: QueryActor,
): Promise<{ key: string; plaintext: string }[]> {
  if (isActorContentBlocked(actor)) return [];

  const baseWhere = {
    projectId,
    project: { is: projectWhereForVaultRead(actor) },
  };

  const secrets = await (hasUnrestrictedProjectScope(actor.role)
    ? prisma.secret.findMany({
        where:   baseWhere,
        select:  FULL_SELECT,
        orderBy: { key: "asc" },
      })
    : (async () => {
        const scope = await getVaultProjectIdsForActor(actor);
        if (!scope.includes(projectId)) return [];
        return prisma.secret.findMany({
          where:   baseWhere,
          select:  FULL_SELECT,
          orderBy: { key: "asc" },
        });
      })()
  );

  return secrets.map((s) => ({
    key:       s.key,
    plaintext: decryptValue(s.encryptedValue, s.iv),
  }));
}

/**
 * Fetches all secrets the actor owns or has been granted access to,
 * across all projects. Ciphertext excluded.
 */
export async function getAccessibleSecrets(actor: QueryActor) {
  if (isActorContentBlocked(actor)) return [];

  const projectRead = projectWhereForVaultRead(actor);

  if (hasUnrestrictedProjectScope(actor.role)) {
    return prisma.secret.findMany({
      where:   { project: { is: projectRead } },
      select:  LIST_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  const scope = await getVaultProjectIdsForActor(actor);
  if (scope.length === 0) return [];

  return prisma.secret.findMany({
    where:   { projectId: { in: scope }, project: { is: projectRead } },
    select:  LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

const DASHBOARD_RECENT_SELECT = {
  id:      true,
  key:     true,
  project: { select: { name: true } },
} as const;

export type RecentDashboardSecretsResult = {
  items: Array<{
    id: string;
    key: string;
    project: { name: string };
  }>;
  /** USER/INTERN with zero ProjectMember rows — must not see or copy any vault secrets on Overview. */
  showAssignmentRequired: boolean;
};

/**
 * Recent secrets for the dashboard Overview.
 * USER/INTERN see all secrets in projects they are assigned to (ProjectMember scope). No project
 * assignment ⇒ empty list (no Copy).
 */
export async function getRecentDashboardSecrets(actor: QueryActor): Promise<RecentDashboardSecretsResult> {
  if (isActorContentBlocked(actor)) {
    return { items: [], showAssignmentRequired: false };
  }

  const projectRead = projectWhereForVaultRead(actor);

  if (hasUnrestrictedProjectScope(actor.role)) {
    const items = await prisma.secret.findMany({
      where:   { project: { is: projectRead } },
      take:    8,
      orderBy: { createdAt: "desc" },
      select:  DASHBOARD_RECENT_SELECT,
    });
    return { items, showAssignmentRequired: false };
  }

  const projectIds = await getVaultProjectIdsForActor(actor);

  if (projectIds.length === 0) {
    return { items: [], showAssignmentRequired: true };
  }

  const items = await prisma.secret.findMany({
    where: {
      projectId: { in: projectIds },
      project:   { is: projectRead },
    },
    take:    8,
    orderBy: { createdAt: "desc" },
    select:  DASHBOARD_RECENT_SELECT,
  });

  return { items, showAssignmentRequired: false };
}
