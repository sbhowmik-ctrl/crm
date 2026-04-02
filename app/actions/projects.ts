"use server";

import { z } from "zod";
import { ActivityAction, Role } from "@prisma/client";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { canUserPerformAction } from "@/lib/permissions";
import { assertActiveVaultSession } from "@/lib/session-guards";
import { getVaultProjectIdsForActor } from "@/lib/queries/access";
import { vaultWhereActive, VAULT_ENTITY_STATUS } from "@/lib/vault-entity-status";

// --- Schemas ---

const ProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required."),
  description: z.string().trim().optional(),
  /** When set, creates a subproject under this parent (must exist). */
  parentId: z.string().cuid().optional(),
});

const UpdateProjectSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1, "Project name is required."),
  description: z.string().trim().optional(),
});

// --- Types ---

export type ProjectResult =
  | { success: true; id: string }
  | { success: false; error: string };

// --- Internal Helpers ---

async function collectProjectSubtreeIds(rootId: string): Promise<string[]> {
  const rows = await prisma.project.findMany({
    select: { id: true, parentId: true },
  });
  const childrenByParent = new Map<string, string[]>();
  for (const p of rows) {
    if (p.parentId === null) continue;
    if (!childrenByParent.has(p.parentId)) childrenByParent.set(p.parentId, []);
    childrenByParent.get(p.parentId)!.push(p.id);
  }
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    for (const c of childrenByParent.get(id) ?? []) stack.push(c);
  }
  return out;
}

// --- Actions ---

/**
 * Creates a new project or subproject.
 */
export async function createProject(
  _prev: ProjectResult | null,
  formData: FormData,
): Promise<ProjectResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  const actor = { id: vault.user.id, role: vault.user.role };
  if (!canUserPerformAction(actor, null, "project", "create")) {
    return { success: false, error: "You do not have permission to create projects." };
  }

  const rawParent = formData.get("parentId");
  const parentIdFromForm =
    typeof rawParent === "string" && rawParent.trim().length > 0 ? rawParent.trim() : undefined;

  const parsed = ProjectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    parentId: parentIdFromForm,
  });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  if (parsed.data.parentId) {
    const parent = await prisma.project.findFirst({
      where: { id: parsed.data.parentId, ...vaultWhereActive },
      select: { id: true },
    });
    if (!parent) {
      return { success: false, error: "Parent project was not found." };
    }

    if (actor.role === Role.MODERATOR) {
      const scope = await getVaultProjectIdsForActor({
        id: actor.id,
        role: actor.role,
      });
      if (!scope.includes(parsed.data.parentId)) {
        return {
          success: false,
          error: "You can only create subprojects under projects in your assignment scope.",
        };
      }
    }
  }

  const existing = await prisma.project.findUnique({
    where: { name: parsed.data.name },
    select: { id: true },
  });
  if (existing) {
    return { success: false, error: `A project named "${parsed.data.name}" already exists.` };
  }

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      createdById: vault.user.id,
      updatedById: vault.user.id,
      ownerId: vault.user.id,
      ...(parsed.data.parentId ? { parentId: parsed.data.parentId } : {}),
    },
    select: { id: true },
  });

  await logActivity({
    actorId: vault.user.id,
    action: ActivityAction.CREATE,
    entityType: "project",
    entityId: project.id,
    label: parsed.data.name,
  });

  return { success: true, id: project.id };
}

/**
 * Updates an existing project's title and description.
 */
export async function updateProject(
  raw: { projectId: string; name: string; description?: string }
): Promise<ProjectResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  const actor = { id: vault.user.id, role: vault.user.role };
  if (!canUserPerformAction(actor, null, "project", "update")) {
    return { success: false, error: "Unauthorized to edit projects." };
  }

  const parsed = UpdateProjectSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    const updated = await prisma.project.update({
      where: { id: parsed.data.projectId },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        updatedById: vault.user.id,
      },
    });

    await logActivity({
      actorId: vault.user.id,
      action: ActivityAction.UPDATE,
      entityType: "project",
      entityId: parsed.data.projectId,
      label: parsed.data.name,
    });

    return { success: true, id: updated.id };
  } catch (err) {
    // Usually a P2002 Unique Constraint violation on the name
    return { success: false, error: "Update failed. Project name may already be in use." };
  }
}

/**
 * Archives a project and all its sub-descendants.
 */
export async function archiveProject(projectId: string): Promise<ProjectResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  const actor = { id: vault.user.id, role: vault.user.role };
  if (!canUserPerformAction(actor, null, "project", "delete")) {
    return { success: false, error: "You do not have permission to archive projects." };
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...vaultWhereActive },
    select: { id: true, name: true },
  });
  if (!project) return { success: false, error: "Project not found." };

  if (actor.role === Role.MODERATOR) {
    const scope = await getVaultProjectIdsForActor({ id: actor.id, role: actor.role });
    if (!scope.includes(projectId)) {
      return { success: false, error: "You cannot archive a project outside your assignment scope." };
    }
  }

  const subtreeIds = await collectProjectSubtreeIds(projectId);
  if (subtreeIds.length === 0) {
    return { success: false, error: "Project not found." };
  }

  const [rootId, ...childIds] = subtreeIds;

  await prisma.project.update({
    where: { id: rootId },
    data: { status: VAULT_ENTITY_STATUS.ARCHIVED, updatedById: vault.user.id },
  });

  if (childIds.length > 0) {
    await prisma.project.updateMany({
      where: { id: { in: childIds } },
      data: { status: VAULT_ENTITY_STATUS.ARCHIVED },
    });
  }

  await logActivity({
    actorId: vault.user.id,
    action: ActivityAction.ARCHIVE,
    entityType: "project",
    entityId: projectId,
    label:
      subtreeIds.length > 1
        ? `${project.name} (+${subtreeIds.length - 1} subproject(s))`
        : project.name,
  });

  return { success: true, id: projectId };
}

/**
 * Restores an archived project (and its subprojects) back to ACTIVE status.
 */
export async function unarchiveProject(projectId: string): Promise<ProjectResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  const actor = { id: vault.user.id, role: vault.user.role };
  if (!canUserPerformAction(actor, null, "project", "delete")) {
    return { success: false, error: "You do not have permission to restore projects." };
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, status: VAULT_ENTITY_STATUS.ARCHIVED },
    select: { id: true, name: true },
  });
  if (!project) return { success: false, error: "Project not found." };

  if (actor.role === Role.MODERATOR) {
    const scope = await getVaultProjectIdsForActor({ id: actor.id, role: actor.role });
    if (!scope.includes(projectId)) {
      return { success: false, error: "You cannot restore a project outside your assignment scope." };
    }
  }

  const subtreeIds = await collectProjectSubtreeIds(projectId);
  if (subtreeIds.length === 0) {
    return { success: false, error: "Project not found." };
  }

  const [rootId, ...childIds] = subtreeIds;

  await prisma.project.update({
    where: { id: rootId },
    data: { status: VAULT_ENTITY_STATUS.ACTIVE, updatedById: vault.user.id },
  });

  if (childIds.length > 0) {
    await prisma.project.updateMany({
      where: { id: { in: childIds }, status: VAULT_ENTITY_STATUS.ARCHIVED },
      data: { status: VAULT_ENTITY_STATUS.ACTIVE },
    });
  }

  await logActivity({
    actorId: vault.user.id,
    action: ActivityAction.STATUS,
    entityType: "project",
    entityId: projectId,
    label:
      subtreeIds.length > 1
        ? `Restored ${project.name} (+${subtreeIds.length - 1} subproject(s))`
        : `Restored ${project.name}`,
  });

  return { success: true, id: projectId };
}