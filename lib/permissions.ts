import { Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResourceType = "user" | "secret" | "note" | "project";

export type Action = "create" | "read" | "update" | "delete";

/**
 * The subset of a User record needed for permission checks.
 * Using a lightweight shape avoids importing the full Prisma model everywhere.
 */
export interface PermissionActor {
  id: string;
  role: Role;
}

// ---------------------------------------------------------------------------
// Role hierarchy — higher index = higher privilege.
// Used to compare ranks without a chain of if/else.
// ---------------------------------------------------------------------------

const ROLE_RANK: Record<Role, number> = {
  [Role.INTERN]:     0,
  [Role.USER]:       1,
  [Role.MODERATOR]:  2,
  [Role.ADMIN]:      3,
  [Role.SUPERADMIN]: 4,
};

function rankOf(role: Role): number {
  return ROLE_RANK[role];
}

// ---------------------------------------------------------------------------
// Core permission rules
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `actor` is allowed to perform `action` on `resource`.
 *
 * Rules:
 *  - SUPERADMIN  → unrestricted access to everything.
 *  - ADMIN       → full CRUD on users whose role is below ADMIN (MODERATOR / USER / INTERN).
 *                  Full CRUD on secrets, notes, and projects.
 *  - MODERATOR   → full CRUD on secrets and notes. Read-only on users and projects.
 *  - USER/INTERN → read-only on every resource type.
 *
 * When `target` is provided it represents the user being acted upon, allowing
 * the rank-based guard for admin→user management.
 *
 * @param actor   - The user attempting the action.
 * @param target  - The user being acted upon (only relevant for resource "user").
 *                  Pass `null` for non-user resources.
 * @param resource - The type of resource being accessed.
 * @param action  - The CRUD action being attempted.
 */
export function canUserPerformAction(
  actor: PermissionActor,
  target: PermissionActor | null,
  resource: ResourceType,
  action: Action
): boolean {
  // SUPERADMIN is unrestricted.
  if (actor.role === Role.SUPERADMIN) return true;

  switch (resource) {
    case "user":
      return canActOnUser(actor, target, action);

    case "secret":
    case "note":
      return canActOnContent(actor, action);

    case "project":
      return canActOnProject(actor, action);

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Resource-specific helpers (kept private to this module)
// ---------------------------------------------------------------------------

function canActOnUser(
  actor: PermissionActor,
  target: PermissionActor | null,
  action: Action
): boolean {
  // Everyone can read user records (e.g. profile views, member lists).
  if (action === "read") return true;

  // Only ADMINs may mutate other users — and only those ranked below them.
  if (actor.role !== Role.ADMIN) return false;

  // An admin cannot create/update/delete users at ADMIN rank or above.
  if (target && rankOf(target.role) >= rankOf(Role.ADMIN)) return false;

  // Admins cannot elevate or demote themselves.
  if (target && target.id === actor.id) return false;

  return true;
}

function canActOnContent(actor: PermissionActor, action: Action): boolean {
  // MODERATORs and above may fully CRUD secrets and notes.
  if (rankOf(actor.role) >= rankOf(Role.MODERATOR)) return true;

  // USERs and INTERNs are read-only.
  return action === "read";
}

function canActOnProject(actor: PermissionActor, action: Action): boolean {
  // Only ADMINs and above may mutate projects.
  if (rankOf(actor.role) >= rankOf(Role.ADMIN)) return true;

  // Everyone else is read-only.
  return action === "read";
}
