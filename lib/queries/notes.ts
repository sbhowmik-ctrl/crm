/**
 * lib/queries/notes.ts
 *
 * Access-controlled server-side queries for the Note model.
 *
 *   1. ADMIN / SUPERADMIN → all notes.
 *   2. MODERATOR          → project-linked notes only in assigned projects; all such notes there.
 *   3. USER / INTERN      → all PROJECT_BASED notes in assigned projects; NORMAL notes still
 *     owner OR sharedWith only.
 */

import { NoteType, Role } from "@prisma/client";
import { prisma }         from "@/lib/prisma";
import {
  noteWhereForVaultRead,
  projectWhereForVaultRead,
  vaultWhereActive,
  VAULT_ENTITY_STATUS,
} from "@/lib/vault-entity-status";
import {
  allowedAccessWhere,
  getVaultProjectIdsForActor,
  hasUnrestrictedProjectScope,
  isActorContentBlocked,
  type QueryActor,
} from "./access";

// ---------------------------------------------------------------------------
// Shared select shape
// ---------------------------------------------------------------------------

const NOTE_SELECT = {
  id:         true,
  title:      true,
  content:    true,
  type:       true,
  status:     true,
  ownerId:    true,
  projectId:  true,
  createdAt:  true,
  updatedAt:  true,
  project:    { select: { id: true, name: true } },
  owner:      { select: { id: true, name: true, email: true } },
  updatedBy:  { select: { id: true, name: true, email: true } },
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
  if (isActorContentBlocked(actor)) return null;

  const noteRead = noteWhereForVaultRead(actor);

  if (hasUnrestrictedProjectScope(actor.role)) {
    return prisma.note.findFirst({
      where:  { id, ...noteRead },
      select: NOTE_SELECT,
    });
  }

  if (actor.role === Role.MODERATOR) {
    const note = await prisma.note.findFirst({
      where:  { id, ...noteRead },
      select: NOTE_SELECT,
    });
    if (!note) return null;
    if (note.type === NoteType.NORMAL) return note;
    if (!note.projectId) return null;
    const scope = await getVaultProjectIdsForActor(actor);
    return scope.includes(note.projectId) ? note : null;
  }

  const scope = await getVaultProjectIdsForActor(actor);
  return prisma.note.findFirst({
    where: {
      AND: [
        { id, ...noteRead },
        {
          OR: [
            {
              type: NoteType.NORMAL,
              OR: [
                { ownerId: actor.id },
                { sharedWith: { some: { id: actor.id } } },
              ],
            },
            {
              type:      NoteType.PROJECT_BASED,
              projectId: { in: scope },
            },
          ],
        },
      ],
    },
    select: NOTE_SELECT,
  });
}

/**
 * Fetches all accessible notes within a project (PROJECT_BASED notes).
 */
export async function getNotesByProject(projectId: string, actor: QueryActor) {
  if (isActorContentBlocked(actor)) return [];

  const baseWhere = {
    projectId,
    type:    NoteType.PROJECT_BASED,
    ...noteWhereForVaultRead(actor),
    project: { is: projectWhereForVaultRead(actor) },
  };

  if (hasUnrestrictedProjectScope(actor.role)) {
    return prisma.note.findMany({
      where:   baseWhere,
      select:  NOTE_SELECT,
      orderBy: { updatedAt: "desc" },
    });
  }

  const scope = await getVaultProjectIdsForActor(actor);
  if (!scope.includes(projectId)) return [];

  return prisma.note.findMany({
    where:   baseWhere,
    select:  NOTE_SELECT,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Fetches all NORMAL (non-project-linked) notes the actor can access.
 */
export async function getGeneralNotes(actor: QueryActor) {
  if (isActorContentBlocked(actor)) return [];

  const baseWhere = { type: NoteType.NORMAL, ...vaultWhereActive };

  if (hasUnrestrictedProjectScope(actor.role) || actor.role === Role.MODERATOR) {
    return prisma.note.findMany({
      where:   baseWhere,
      select:  NOTE_SELECT,
      orderBy: { updatedAt: "desc" },
    });
  }

  return prisma.note.findMany({
    where: {
      AND: [baseWhere, allowedAccessWhere(actor)],
    },
    select:  NOTE_SELECT,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Fetches all notes the actor owns or has been granted access to,
 * across both NORMAL and PROJECT_BASED types.
 */
export async function getAccessibleNotes(actor: QueryActor) {
  if (isActorContentBlocked(actor)) return [];

  if (hasUnrestrictedProjectScope(actor.role)) {
    return prisma.note.findMany({
      where:   vaultWhereActive,
      select:  NOTE_SELECT,
      orderBy: { updatedAt: "desc" },
    });
  }

  if (actor.role === Role.MODERATOR) {
    const scope = await getVaultProjectIdsForActor(actor);
    return prisma.note.findMany({
      where: {
        AND: [
          vaultWhereActive,
          {
            OR: [
              { type: NoteType.NORMAL },
              {
                type:      NoteType.PROJECT_BASED,
                projectId: { in: scope },
              },
            ],
          },
        ],
      },
      select:  NOTE_SELECT,
      orderBy: { updatedAt: "desc" },
    });
  }

  const scope = await getVaultProjectIdsForActor(actor);
  return prisma.note.findMany({
    where: {
      AND: [
        vaultWhereActive,
        {
          OR: [
            {
              type: NoteType.NORMAL,
              OR: [
                { ownerId: actor.id },
                { sharedWith: { some: { id: actor.id } } },
              ],
            },
            {
              type:      NoteType.PROJECT_BASED,
              projectId: { in: scope },
            },
          ],
        },
      ],
    },
    select:  NOTE_SELECT,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * All accessible notes (NORMAL + PROJECT_BASED) with the given status (e.g. archived list).
 */
export async function getAccessibleNotesByStatus(
  actor: QueryActor,
  status: typeof VAULT_ENTITY_STATUS.ARCHIVED,
) {
  if (isActorContentBlocked(actor)) return [];

  const statusWhere = { status };

  if (hasUnrestrictedProjectScope(actor.role)) {
    return prisma.note.findMany({
      where:   statusWhere,
      select:  NOTE_SELECT,
      orderBy: { updatedAt: "desc" },
    });
  }

  if (actor.role === Role.MODERATOR) {
    const scope = await getVaultProjectIdsForActor(actor);
    return prisma.note.findMany({
      where: {
        AND: [
          statusWhere,
          {
            OR: [
              { type: NoteType.NORMAL },
              { type: NoteType.PROJECT_BASED, projectId: { in: scope } },
            ],
          },
        ],
      },
      select:  NOTE_SELECT,
      orderBy: { updatedAt: "desc" },
    });
  }

  const scope = await getVaultProjectIdsForActor(actor);
  return prisma.note.findMany({
    where: {
      AND: [
        statusWhere,
        {
          OR: [
            {
              type: NoteType.NORMAL,
              OR: [
                { ownerId: actor.id },
                { sharedWith: { some: { id: actor.id } } },
              ],
            },
            {
              type:      NoteType.PROJECT_BASED,
              projectId: { in: scope },
            },
          ],
        },
      ],
    },
    select:  NOTE_SELECT,
    orderBy: { updatedAt: "desc" },
  });
}
