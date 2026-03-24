"use server";

import { z } from "zod";
import { NoteType } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canUserPerformAction } from "@/lib/permissions";

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
  | { success: true;  data: { id: string } }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

// ---------------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------------

/**
 * Creates a new Note record.
 *
 * Guards:
 *  1. User must be authenticated.
 *  2. MODERATOR or above (canUserPerformAction enforces this).
 *  3. For PROJECT_BASED notes, the referenced project must exist.
 *  4. projectId is cleared for NORMAL notes so no orphaned FK is stored.
 */
export async function saveNote(rawInput: SaveNoteInput): Promise<SaveNoteResult> {
  // ------------------------------------------------------------------
  // 1. Auth
  // ------------------------------------------------------------------
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  // ------------------------------------------------------------------
  // 2. RBAC
  // ------------------------------------------------------------------
  const actor = { id: session.user.id, role: session.user.role };
  if (!canUserPerformAction(actor, null, "note", "create")) {
    return {
      success: false,
      error: `Your role (${session.user.role}) only has read access. Creating notes requires Moderator or above.`,
    };
  }

  // ------------------------------------------------------------------
  // 3. Trim + validate
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

  // ------------------------------------------------------------------
  // 4. For PROJECT_BASED notes, verify the project exists.
  // ------------------------------------------------------------------
  if (type === NoteType.PROJECT_BASED && projectId) {
    const project = await prisma.project.findUnique({
      where:  { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return {
        success: false,
        error:   "Validation failed.",
        fieldErrors: { projectId: "Selected project no longer exists." },
      };
    }
  }

  // ------------------------------------------------------------------
  // 5. Persist — projectId is null for NORMAL notes.
  // ------------------------------------------------------------------
  const note = await prisma.note.create({
    data: {
      title,
      content,
      type,
      projectId: type === NoteType.PROJECT_BASED ? (projectId ?? null) : null,
      ownerId:   session.user.id,
    },
    select: { id: true },
  });

  return { success: true, data: { id: note.id } };
}
