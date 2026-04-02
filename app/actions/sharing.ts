"use server";

import { ActivityAction, NoteType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auth }                 from "@/auth";
import { logActivity }          from "@/lib/activity-log";
import { prisma }               from "@/lib/prisma";
import { canUserPerformAction } from "@/lib/permissions";
import { assertActiveVaultSession } from "@/lib/session-guards";
import { assertModeratorAssignedToProject } from "@/lib/project-scope-guards";
import { vaultWhereActive } from "@/lib/vault-entity-status";
import { eventBus }             from "@/lib/event-bus";

export type SharingResult =
  | { success: true }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Auth + permission helper — MODERATOR or above may manage access lists
// ---------------------------------------------------------------------------

async function requireEditor() {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { actor: null, error: vault.error };

  const actor = { id: vault.user.id, role: vault.user.role };
  const canEdit = canUserPerformAction(actor, null, "secret", "update");
  if (!canEdit) return { actor: null, error: "Only Moderators and above can manage access." };

  return { actor, error: null as string | null };
}

// ---------------------------------------------------------------------------
// Secret sharing
// ---------------------------------------------------------------------------

export async function addUserToSecret(
  secretId: string,
  userId: string,
): Promise<SharingResult> {
  const { actor, error } = await requireEditor();
  if (error || !actor) return { success: false, error: error ?? "Unauthorized." };

  const secret = await prisma.secret.findFirst({
    where:  { id: secretId, project: { is: vaultWhereActive } },
    select: { id: true, projectId: true },
  });
  if (!secret) return { success: false, error: "Secret not found." };

  const scope = await assertModeratorAssignedToProject(actor, secret.projectId);
  if (!scope.ok) return { success: false, error: scope.error };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { success: false, error: "User not found." };

  await prisma.secret.update({
    where: { id: secretId },
    data:  { sharedWith: { connect: { id: userId } } },
  });

  await logActivity({
    actorId:    actor.id,
    action:     ActivityAction.ASSIGN,
    entityType: "sharing_secret",
    entityId:   secretId,
    label:      `Granted access to user ${userId}`,
  });

  return { success: true };
}

export async function removeUserFromSecret(
  secretId: string,
  userId: string,
): Promise<SharingResult> {
  const { actor, error } = await requireEditor();
  if (error || !actor) return { success: false, error: error ?? "Unauthorized." };

  const secret = await prisma.secret.findFirst({
    where:  { id: secretId, project: { is: vaultWhereActive } },
    select: { id: true, projectId: true },
  });
  if (!secret) return { success: false, error: "Secret not found." };

  const scope = await assertModeratorAssignedToProject(actor, secret.projectId);
  if (!scope.ok) return { success: false, error: scope.error };

  await prisma.secret.update({
    where: { id: secretId },
    data:  { sharedWith: { disconnect: { id: userId } } },
  });

  await logActivity({
    actorId:    actor.id,
    action:     ActivityAction.REMOVE,
    entityType: "sharing_secret",
    entityId:   secretId,
    label:      `Revoked access for user ${userId}`,
  });

  // Broadcast the revocation to the specific user so their client refreshes
  eventBus.emit("vault_event", {
    type: "ACCESS_REVOKED",
    userId: userId,
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Note sharing
// ---------------------------------------------------------------------------

export async function addUserToNote(
  noteId: string,
  userId: string,
): Promise<SharingResult> {
  const { actor, error } = await requireEditor();
  if (error || !actor) return { success: false, error: error ?? "Unauthorized." };

  const note = await prisma.note.findFirst({
    where:  { id: noteId, ...vaultWhereActive },
    select: { id: true, type: true, projectId: true },
  });
  if (!note) return { success: false, error: "Note not found." };

  if (note.type === NoteType.PROJECT_BASED && note.projectId) {
    const scope = await assertModeratorAssignedToProject(actor, note.projectId);
    if (!scope.ok) return { success: false, error: scope.error };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { success: false, error: "User not found." };

  await prisma.note.update({
    where: { id: noteId },
    data:  { sharedWith: { connect: { id: userId } } },
  });

  await logActivity({
    actorId:    actor.id,
    action:     ActivityAction.ASSIGN,
    entityType: "sharing_note",
    entityId:   noteId,
    label:      `Granted access to user ${userId}`,
  });

  return { success: true };
}

export async function removeUserFromNote(
  noteId: string,
  userId: string,
): Promise<SharingResult> {
  const { actor, error } = await requireEditor();
  if (error || !actor) return { success: false, error: error ?? "Unauthorized." };

  const note = await prisma.note.findFirst({
    where:  { id: noteId, ...vaultWhereActive },
    select: { id: true, type: true, projectId: true },
  });
  if (!note) return { success: false, error: "Note not found." };

  if (note.type === NoteType.PROJECT_BASED && note.projectId) {
    const scope = await assertModeratorAssignedToProject(actor, note.projectId);
    if (!scope.ok) return { success: false, error: scope.error };
  }

  await prisma.note.update({
    where: { id: noteId },
    data:  { sharedWith: { disconnect: { id: userId } } },
  });

  await logActivity({
    actorId:    actor.id,
    action:     ActivityAction.REMOVE,
    entityType: "sharing_note",
    entityId:   noteId,
    label:      `Revoked access for user ${userId}`,
  });

  // Broadcast the revocation to the specific user so their client refreshes
  eventBus.emit("vault_event", {
    type: "ACCESS_REVOKED",
    userId: userId,
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Credential section sharing (general vault — same editor gate as notes)
// ---------------------------------------------------------------------------

export async function addUserToCredentialSection(
  sectionId: string,
  userId: string,
): Promise<SharingResult> {
  const { actor, error } = await requireEditor();
  if (error || !actor) return { success: false, error: error ?? "Unauthorized." };

  const section = await prisma.credentialSection.findFirst({
    where:  { id: sectionId, ...vaultWhereActive },
    select: { id: true },
  });
  if (!section) return { success: false, error: "Credential section not found." };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { success: false, error: "User not found." };

  await prisma.credentialSection.update({
    where: { id: sectionId },
    data:  { sharedWith: { connect: { id: userId } } },
  });

  await logActivity({
    actorId:    actor.id,
    action:     ActivityAction.ASSIGN,
    entityType: "sharing_credential_section",
    entityId:   sectionId,
    label:      `Granted access to user ${userId}`,
  });

  revalidatePath("/dashboard/credentials");
  revalidatePath(`/dashboard/credentials/${sectionId}`);

  return { success: true };
}

export async function removeUserFromCredentialSection(
  sectionId: string,
  userId: string,
): Promise<SharingResult> {
  const { actor, error } = await requireEditor();
  if (error || !actor) return { success: false, error: error ?? "Unauthorized." };

  const section = await prisma.credentialSection.findFirst({
    where:  { id: sectionId, ...vaultWhereActive },
    select: { id: true },
  });
  if (!section) return { success: false, error: "Credential section not found." };

  await prisma.credentialSection.update({
    where: { id: sectionId },
    data:  { sharedWith: { disconnect: { id: userId } } },
  });

  await logActivity({
    actorId:    actor.id,
    action:     ActivityAction.REMOVE,
    entityType: "sharing_credential_section",
    entityId:   sectionId,
    label:      `Revoked access for user ${userId}`,
  });

  eventBus.emit("vault_event", {
    type:   "ACCESS_REVOKED",
    userId: userId,
  });

  revalidatePath("/dashboard/credentials");
  revalidatePath(`/dashboard/credentials/${sectionId}`);

  return { success: true };
}