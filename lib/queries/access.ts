/**
 * lib/queries/access.ts
 *
 * Shared primitives for access control:
 *
 *   - **ADMIN / SUPERADMIN** — full vault scope (no `ProjectMember` filter).
 *   - **MODERATOR** — assigned to one or more projects via `ProjectMember`; vault access
 *     covers the **entire tree** for each assignment (walk up to root, include root + all
 *     descendants). Full visibility of secrets/notes in those projects (not owner/shared only).
 *   - **USER / INTERN** — direct `ProjectMember` assignments **plus every ancestor** (parent chain
 *     up to the root). **Siblings** (other subprojects under the same parent) are **not** included.
 *     Within those projects they see **all** secrets and project-linked notes (same as MODERATOR).
 *     For NORMAL (non–project) notes, still owner or `sharedWith` only — via `allowedAccessWhere()`.
 */

import { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { vaultWhereActive } from "@/lib/vault-entity-status";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueryActor {
  id:   string;
  role: Role;
  /** When `false`, the actor must not receive any vault content (secrets, notes, projects). */
  isActive?: boolean;
}

/**
 * Inactive accounts may sign in but must not read vault data.
 */
export function isActorContentBlocked(actor: QueryActor): boolean {
  return actor.isActive === false;
}

// ---------------------------------------------------------------------------
// Role rank — mirrors lib/permissions.ts without importing it
// (keeping the query layer independent of the UI permission layer)
// ---------------------------------------------------------------------------

const ROLE_RANK: Record<Role, number> = {
  [Role.INTERN]:     0,
  [Role.USER]:       1,
  [Role.MODERATOR]:  2,
  [Role.ADMIN]:      3,
  [Role.SUPERADMIN]: 4,
};

/**
 * True for **ADMIN** and **SUPERADMIN** — no project-membership filter on the vault.
 */
export function hasUnrestrictedProjectScope(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[Role.ADMIN];
}

/**
 * @deprecated Prefer `hasUnrestrictedProjectScope` + explicit MODERATOR handling.
 * True for MODERATOR+ (elevated actions within an allowed project context).
 */
export function hasBroadAccess(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[Role.MODERATOR];
}

/** Direct `ProjectMember` rows only (no tree expansion). */
export async function getAssignedProjectIdsForUser(userId: string): Promise<string[]> {
  const rows = await prisma.projectMember.findMany({
    where:  { userId },
    select: { projectId: true },
  });
  return rows.map((r) => r.projectId);
}

/**
 * For each assigned project id, walks to the root, then collects that root and every
 * descendant subproject. Unions multiple trees if assignments span them.
 */
export async function expandModeratorVaultScope(directAssignedIds: string[]): Promise<string[]> {
  if (directAssignedIds.length === 0) return [];

  const allProjects = await prisma.project.findMany({
    where:  vaultWhereActive,
    select: { id: true, parentId: true },
  });
  if (allProjects.length === 0) return [];

  const parentById = new Map(allProjects.map((p) => [p.id, p.parentId]));

  function rootOf(startId: string): string {
    let cur = startId;
    for (;;) {
      const parentId = parentById.get(cur);
      if (!parentId) return cur;
      cur = parentId;
    }
  }

  const roots = new Set(directAssignedIds.map(rootOf));

  const childrenByParent = new Map<string, string[]>();
  for (const p of allProjects) {
    if (p.parentId === null) continue;
    if (!childrenByParent.has(p.parentId)) childrenByParent.set(p.parentId, []);
    childrenByParent.get(p.parentId)!.push(p.id);
  }

  const out = new Set<string>();
  for (const root of roots) {
    out.add(root);
    const stack = [root];
    while (stack.length) {
      const pid = stack.pop()!;
      for (const childId of childrenByParent.get(pid) ?? []) {
        out.add(childId);
        stack.push(childId);
      }
    }
  }
  return [...out];
}

/**
 * Direct assignments plus every parent up to the root (no siblings, no descendants).
 */
export async function expandUserInternAncestorScope(directAssignedIds: string[]): Promise<string[]> {
  if (directAssignedIds.length === 0) return [];

  const allProjects = await prisma.project.findMany({
    where:  vaultWhereActive,
    select: { id: true, parentId: true },
  });
  if (allProjects.length === 0) return [];

  const parentById = new Map(allProjects.map((p) => [p.id, p.parentId]));
  const out = new Set<string>();

  for (const startId of directAssignedIds) {
    if (!parentById.has(startId)) continue;
    out.add(startId);
    let cur = startId;
    for (;;) {
      const parentId = parentById.get(cur);
      if (!parentId) break;
      out.add(parentId);
      cur = parentId;
    }
  }
  return [...out];
}

/**
 * Project IDs the actor may access for vault reads/writes (non–admin roles).
 * - MODERATOR: full tree under each assignment’s root (root + all descendants).
 * - USER / INTERN: direct assignments + ancestor chain only (parent access, not siblings).
 * Do not use when `hasUnrestrictedProjectScope(role)` — admins bypass this list.
 */
export async function getVaultProjectIdsForActor(actor: QueryActor): Promise<string[]> {
  const direct = await getAssignedProjectIdsForUser(actor.id);
  if (direct.length === 0) return [];
  if (actor.role === Role.MODERATOR) {
    return expandModeratorVaultScope(direct);
  }
  if (actor.role === Role.USER || actor.role === Role.INTERN) {
    return expandUserInternAncestorScope(direct);
  }
  return direct;
}

// ---------------------------------------------------------------------------
// Prisma WHERE fragment for restricted actors
// ---------------------------------------------------------------------------

/**
 * Returns a Prisma `where` fragment that limits results to records the actor
 * either owns or has been explicitly granted access to via `sharedWith`.
 *
 * Intended for **NORMAL** notes and similar — not for project-scoped secrets/notes when the actor
 * is already a `ProjectMember`. Callers should short-circuit with `hasUnrestrictedProjectScope()`
 * and project-scope handling first.
 *
 * Usage:
 *   prisma.secret.findMany({ where: { projectId, ...allowedAccessWhere(actor) } })
 */
export function allowedAccessWhere(actor: QueryActor) {
  return {
    OR: [
      { ownerId:    actor.id },
      { sharedWith: { some: { id: actor.id } } },
    ],
  };
}
