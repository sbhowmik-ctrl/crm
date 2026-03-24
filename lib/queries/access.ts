/**
 * lib/queries/access.ts
 *
 * Shared primitives for the 3-condition access control model:
 *
 *   A record is returned ONLY when at least one of these is true:
 *     1. Actor is SUPERADMIN
 *     2. Actor's role is MODERATOR or above  (broad / role-based access)
 *     3. Actor is the owner  OR  their ID is in the record's sharedWith list
 *        (explicit per-user access — the "allowedUserIds" concept)
 *
 * Conditions 1 and 2 are collapsed into `hasBroadAccess()`.
 * Condition 3 is expressed as a Prisma `WHERE` sub-clause via `allowedAccessWhere()`.
 *
 * Using DB-level WHERE instead of post-fetch filtering ensures:
 *   - No record data is ever loaded for unauthorised users
 *   - Pagination counts stay accurate
 *   - A single round-trip is enough for both access check + data fetch
 */

import { Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueryActor {
  id:   string;
  role: Role;
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
 * Returns true when the actor's role grants unrestricted read access
 * to all content records (MODERATOR, ADMIN, SUPERADMIN).
 *
 * USER and INTERN must instead pass through the per-record `sharedWith` check.
 */
export function hasBroadAccess(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[Role.MODERATOR];
}

// ---------------------------------------------------------------------------
// Prisma WHERE fragment for restricted actors
// ---------------------------------------------------------------------------

/**
 * Returns a Prisma `where` fragment that limits results to records the actor
 * either owns or has been explicitly granted access to via `sharedWith`.
 *
 * Intended for USER / INTERN roles only — callers should short-circuit with
 * `hasBroadAccess()` first and skip this clause for elevated roles.
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
  } as const;
}
