/**
 * lib/queries/notes.ts
 *
 * Access-controlled server-side queries for the Note model.
 *
 * Every function enforces the 3-condition rule from lib/queries/access.ts:
 *   1. SUPERADMIN          → unrestricted
 *   2. MODERATOR or above  → unrestricted (role-based access)
 *   3. USER / INTERN       → owner OR explicitly in sharedWith (allowedUserIds)
 */

import { NoteType }      from "@prisma/client";
import { prisma }        from "@/lib/prisma";
import { hasBroadAccess, allowedAccessWhere, type QueryActor } from "./access";

// ---------------------------------------------------------------------------
// Shared select shape
// ---------------------------------------------------------------------------

const NOTE_SELECT = {
  id:         true,
  title:      true,
  content:    true,
  type:       true,
  ownerId:    true,
  projectId:  true,
  createdAt:  true,
  updatedAt:  true,
  project:    { select: { id: true, name: true } },
  owner:      { select: { id: true, name: true, email: true } },
  sharedWith: { select: { id: true, name: true, email: true } },
} as const;

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Fetches a single note by ID.
 * Returns `null` when the record does not exist or the actor has no access.
 */
export async function getNoteById(id: string, actor: QueryActor) {
  if (hasBroadAccess(actor.role)) {
    return prisma.note.findUnique({ where: { id }, select: NOTE_SELECT });
  }

  return prisma.note.findFirst({
    where:  { id, ...allowedAccessWhere(actor) },
    select: NOTE_SELECT,
  });
}

/**
 * Fetches all accessible notes within a project (PROJECT_BASED notes).
 */
export async function getNotesByProject(projectId: string, actor: QueryActor) {
  const baseWhere = { projectId, type: NoteType.PROJECT_BASED };

  if (hasBroadAccess(actor.role)) {
    return prisma.note.findMany({
      where:   baseWhere,
      select:  NOTE_SELECT,
      orderBy: { updatedAt: "desc" },
    });
  }

  return prisma.note.findMany({
    where:   { ...baseWhere, ...allowedAccessWhere(actor) },
    select:  NOTE_SELECT,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Fetches all NORMAL (non-project-linked) notes the actor can access.
 */
export async function getGeneralNotes(actor: QueryActor) {
  const baseWhere = { type: NoteType.NORMAL };

  if (hasBroadAccess(actor.role)) {
    return prisma.note.findMany({
      where:   baseWhere,
      select:  NOTE_SELECT,
      orderBy: { updatedAt: "desc" },
    });
  }

  return prisma.note.findMany({
    where:   { ...baseWhere, ...allowedAccessWhere(actor) },
    select:  NOTE_SELECT,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Fetches all notes the actor owns or has been granted access to,
 * across both NORMAL and PROJECT_BASED types.
 */
export async function getAccessibleNotes(actor: QueryActor) {
  if (hasBroadAccess(actor.role)) {
    return prisma.note.findMany({
      select:  NOTE_SELECT,
      orderBy: { updatedAt: "desc" },
    });
  }

  return prisma.note.findMany({
    where:   allowedAccessWhere(actor),
    select:  NOTE_SELECT,
    orderBy: { updatedAt: "desc" },
  });
}
