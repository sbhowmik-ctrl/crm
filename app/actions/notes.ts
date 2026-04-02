"use server";

import { z } from "zod";
import { ActivityAction, NoteType, Role } from "@prisma/client";

import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { canUserPerformAction } from "@/lib/permissions";
import { assertActiveVaultSession } from "@/lib/session-guards";
import { sendPendingApprovalNotificationEmail } from "@/lib/email";
import {
  assertModeratorAssignedToProject,
  assertUserInternAssignedToProject,
} from "@/lib/project-scope-guards";
import { getVaultProjectIdsForActor } from "@/lib/queries/access";
import { vaultWhereActive, VAULT_ENTITY_STATUS } from "@/lib/vault-entity-status";
import { eventBus } from "@/lib/event-bus";

// ---------------------------------------------------------------------------
// Schema — projectId is conditionally required based on type
// ---------------------------------------------------------------------------

const SaveNoteSchema = z
  .object({
    title:     z.string().min(1, "Title is required."),
    content:   z.string().min(1, "Content is required."),
    type:      z.nativeEnum(NoteType),
    projectId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === NoteType.PROJECT_BASED && !data.projectId?.trim()) {
      ctx.addIssue({
        code:    z.ZodIssueCode.custom,
        path:    ["projectId"],
        message: "A project must be selected for Project-based notes.",
      });
    }
  });

export type SaveNoteInput = z.infer<typeof SaveNoteSchema>;

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export type SaveNoteResult =
  | { success: true; data: { id: string }; pendingApproval?: boolean }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

// ---------------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------------

/**
 * Creates a new Note record.
 *
 * Guards:
 * 1. User must be authenticated.
 * 2. MODERATOR or above (canUserPerformAction enforces this).
 * 3. For PROJECT_BASED notes, the referenced project must exist.
 * 4. projectId is cleared for NORMAL notes so no orphaned FK is stored.
 */
export async function saveNote(rawInput: SaveNoteInput): Promise<SaveNoteResult> {
  // ------------------------------------------------------------------
  // 1. Auth
  // ------------------------------------------------------------------
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) {
    return { success: false, error: vault.error };
  }

  // ------------------------------------------------------------------
  // 2. RBAC
  // ------------------------------------------------------------------
  const actor = { id: vault.user.id, role: vault.user.role };

  // ------------------------------------------------------------------
  // 2. Trim + validate
  // ------------------------------------------------------------------
  const parsed = SaveNoteSchema.safeParse({
    title:     rawInput.title?.trim(),
    content:   rawInput.content?.trim(),
    type:      rawInput.type,
    projectId: rawInput.projectId?.trim() || undefined,
  });

  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
    );
    return { success: false, error: "Please fix the errors below.", fieldErrors };
  }

  const { title, content, type, projectId } = parsed.data;

  if (actor.role === Role.INTERN) {
    return {
      success: false,
      error: "Interns cannot create notes.",
    };
  }

  // USER — submit for admin approval.
  if (actor.role === Role.USER) {
    if (type === NoteType.PROJECT_BASED && projectId) {
      const project = await prisma.project.findFirst({
        where:  { id: projectId, ...vaultWhereActive },
        select: { id: true, name: true },
      });
      if (!project) {
        return {
          success: false,
          error:   "Validation failed.",
          fieldErrors: { projectId: "Selected project no longer exists." },
        };
      }

      const scope = await assertUserInternAssignedToProject(actor, projectId);
      if (!scope.ok) return { success: false, error: scope.error };
    }

    const pending = await prisma.pendingNoteSubmission.create({
      data: {
        submitterId: actor.id,
        title,
        content,
        type,
        projectId: type === NoteType.PROJECT_BASED ? (projectId ?? null) : null,
      },
      select: { id: true },
    });

    await logActivity({
      actorId:    vault.user.id,
      action:     ActivityAction.CREATE,
      entityType: "pending_note",
      entityId:   pending.id,
      label:      title,
    });

    const admins = await prisma.user.findMany({
      where: { isActive: true, role: { in: [Role.ADMIN, Role.SUPERADMIN] } },
      select: { email: true },
    });

    const summaryLine =
      type === NoteType.PROJECT_BASED && projectId
        ? `Project-based — title: ${title}`
        : `General note — title: ${title}`;

    await sendPendingApprovalNotificationEmail({
      toAddresses:    admins.map((a) => a.email),
      kind:           "note",
      summaryLine,
      submitterLabel: vault.user.email ?? vault.user.id,
    }).catch(() => {});

    return { success: true, data: { id: pending.id }, pendingApproval: true };
  }

  if (!canUserPerformAction(actor, null, "note", "create")) {
    return {
      success: false,
      error: `Your role (${vault.user.role}) only has read access. Creating notes requires Moderator or above.`,
    };
  }

  if (type === NoteType.PROJECT_BASED && projectId) {
    const project = await prisma.project.findFirst({
      where:  { id: projectId, ...vaultWhereActive },
      select: { id: true },
    });
    if (!project) {
      return {
        success: false,
        error:   "Validation failed.",
        fieldErrors: { projectId: "Selected project no longer exists." },
      };
    }

    const scope = await assertModeratorAssignedToProject(actor, projectId);
    if (!scope.ok) {
      return { success: false, error: scope.error };
    }
  }

  const note = await prisma.note.create({
    data: {
      title,
      content,
      type,
      projectId: type === NoteType.PROJECT_BASED ? (projectId ?? null) : null,
      ownerId:     vault.user.id,
      updatedById: vault.user.id,
    },
    select: { id: true },
  });

  await logActivity({
    actorId:    vault.user.id,
    action:     ActivityAction.CREATE,
    entityType: "note",
    entityId:   note.id,
    label:      title,
  });

  return { success: true, data: { id: note.id } };
}

// ---------------------------------------------------------------------------
// Update note
// ---------------------------------------------------------------------------

const UpdateNoteSchema = z.object({
  noteId:  z.string().min(1, "Note ID must not be empty."),
  title:   z.string().min(1, "Title is required."),
  content: z.string().min(1, "Content is required."),
});

export type UpdateNoteInput  = z.infer<typeof UpdateNoteSchema>;
export type UpdateNoteResult =
  | { success: true; pendingApproval?: boolean }
  | { success: false; error: string };

/**
 * Updates a note's title and content.
 * Requires MODERATOR or above.
 */
export async function updateNote(rawInput: UpdateNoteInput): Promise<UpdateNoteResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  const actor = { id: vault.user.id, role: vault.user.role };
  const isUserEditor = actor.role === Role.USER;

  // Moderators and above still use the central permission check.
  if (!isUserEditor && !canUserPerformAction(actor, null, "note", "update")) {
    return {
      success: false,
      error: `Role "${vault.user.role}" is not permitted to edit notes.`,
    };
  }

  const parsed = UpdateNoteSchema.safeParse({
    noteId:  rawInput.noteId?.trim(),
    title:   rawInput.title?.trim(),
    content: rawInput.content?.trim(),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(" | ") };
  }

  const { noteId, title, content } = parsed.data;

  // ------------------------------------------------------------------
  // 3. Load note with appropriate access guard
  // ------------------------------------------------------------------

  let existing:
    | { id: string; type: NoteType; projectId: string | null }
    | null = null;

  if (isUserEditor) {
    const projectScope = await getVaultProjectIdsForActor(actor);
    // USER: general notes — owner or shared; project notes — any in a project they belong to.
    existing = await prisma.note.findFirst({
      where: {
        id:     noteId,
        status: VAULT_ENTITY_STATUS.ACTIVE,
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
            projectId: { in: projectScope },
          },
        ],
      },
      select: { id: true, type: true, projectId: true },
    });

    if (!existing) {
      return {
        success: false,
        error:  "You can only edit notes you have access to.",
      };
    }

    // USER path — create a pending edit request instead of updating immediately.
    if (existing.type === NoteType.PROJECT_BASED && existing.projectId) {
      const scope = await assertUserInternAssignedToProject(actor, existing.projectId);
      if (!scope.ok) return { success: false, error: scope.error };
    }

    const pending = await prisma.pendingNoteSubmission.create({
      data: {
        submitterId:   actor.id,
        title,
        content,
        type:         existing.type,
        projectId:    existing.type === NoteType.PROJECT_BASED ? existing.projectId : null,
        originalNoteId: existing.id,
      },
      select: { id: true },
    });

    await logActivity({
      actorId:    vault.user.id,
      action:     ActivityAction.UPDATE,
      entityType: "pending_note",
      entityId:   pending.id,
      label:      `Edit request: ${title}`,
    });

    const admins = await prisma.user.findMany({
      where: { isActive: true, role: { in: [Role.ADMIN, Role.SUPERADMIN] } },
      select: { email: true },
    });

    const summaryLine =
      existing.type === NoteType.PROJECT_BASED && existing.projectId
        ? `Edit project-based note — title: ${title}`
        : `Edit general note — title: ${title}`;

    await sendPendingApprovalNotificationEmail({
      toAddresses:    admins.map((a) => a.email),
      kind:           "note",
      summaryLine,
      submitterLabel: vault.user.email ?? vault.user.id,
    }).catch(() => {});

    return { success: true, pendingApproval: true };
  } else {
    // MODERATOR and above: standard update path, but still require the note to exist.
    existing = await prisma.note.findFirst({
      where:  { id: noteId, status: VAULT_ENTITY_STATUS.ACTIVE },
      select: { id: true, type: true, projectId: true },
    });
    if (!existing) return { success: false, error: "Note not found." };

    if (existing.type === NoteType.PROJECT_BASED && existing.projectId) {
      const scope = await assertModeratorAssignedToProject(actor, existing.projectId);
      if (!scope.ok) return { success: false, error: scope.error };
    }
  }

  await prisma.note.update({
    where: { id: noteId },
    data:  { title, content, updatedById: vault.user.id },
  });

  await logActivity({
    actorId:    vault.user.id,
    action:     ActivityAction.UPDATE,
    entityType: "note",
    entityId:   noteId,
    label:      title,
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Archive note
// ---------------------------------------------------------------------------

export type ArchiveNoteResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Archives a single note (no hard delete).
 * Requires MODERATOR or above (same permission tier as former delete).
 */
export async function archiveNote(noteId: string): Promise<ArchiveNoteResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  const actor = { id: vault.user.id, role: vault.user.role };
  if (!canUserPerformAction(actor, null, "note", "delete")) {
    return {
      success: false,
      error: `Role "${vault.user.role}" is not permitted to archive notes.`,
    };
  }

  const note = await prisma.note.findFirst({
    where:  { id: noteId, status: VAULT_ENTITY_STATUS.ACTIVE },
    select: { id: true, title: true, type: true, projectId: true },
  });
  if (!note) return { success: false, error: "Note not found." };

  if (note.type === NoteType.PROJECT_BASED && note.projectId) {
    const scope = await assertModeratorAssignedToProject(actor, note.projectId);
    if (!scope.ok) return { success: false, error: scope.error };
  }

  await prisma.note.update({
    where: { id: noteId },
    data:  { status: VAULT_ENTITY_STATUS.ARCHIVED, updatedById: vault.user.id },
  });

  await logActivity({
    actorId:    vault.user.id,
    action:     ActivityAction.ARCHIVE,
    entityType: "note",
    entityId:   noteId,
    label:      note.title,
  });

  eventBus.emit("vault_event", {
    type: "NOTE_ARCHIVED",
    ...(note.projectId ? { projectId: note.projectId } : {})
  });

  return { success: true };
}

/**
 * Restores an archived note back to ACTIVE.
 * Same RBAC rules as archiving.
 */
export async function unarchiveNote(noteId: string): Promise<ArchiveNoteResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  const actor = { id: vault.user.id, role: vault.user.role };
  if (!canUserPerformAction(actor, null, "note", "delete")) {
    return {
      success: false,
      error: `Role "${vault.user.role}" is not permitted to restore notes.`,
    };
  }

  const note = await prisma.note.findFirst({
    where:  { id: noteId, status: VAULT_ENTITY_STATUS.ARCHIVED },
    select: { id: true, title: true, type: true, projectId: true },
  });
  if (!note) return { success: false, error: "Note not found." };

  if (note.type === NoteType.PROJECT_BASED && note.projectId) {
    const scope = await assertModeratorAssignedToProject(actor, note.projectId);
    if (!scope.ok) return { success: false, error: scope.error };
  }

  await prisma.note.update({
    where: { id: noteId },
    data:  { status: VAULT_ENTITY_STATUS.ACTIVE, updatedById: vault.user.id },
  });

  await logActivity({
    actorId:    vault.user.id,
    action:     ActivityAction.STATUS,
    entityType: "note",
    entityId:   noteId,
    label:      `Restored ${note.title}`,
  });

  return { success: true };
}