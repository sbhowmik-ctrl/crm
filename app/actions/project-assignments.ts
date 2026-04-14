"use server";

import { ActivityAction, Role } from "@prisma/client";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { assertActiveVaultSession } from "@/lib/session-guards";
import { vaultWhereActive } from "@/lib/vault-entity-status";
import { eventBus } from "@/lib/event-bus";

const ROLE_RANK: Record<Role, number> = {
  INTERN: 0, USER: 1, MODERATOR: 2, ADMIN: 3, SUPERADMIN: 4,
};

const ASSIGN_ROLES = new Set<Role>([Role.ADMIN, Role.SUPERADMIN]);

/** Roles that may remove their own `ProjectMember` row via {@link leaveProject}. */
const SELF_LEAVE_ROLES = new Set<Role>([Role.USER, Role.INTERN, Role.MODERATOR]);

export type ProjectAssignmentResult =
  | { success: true }
  | { success: false; error: string };

export type UnassignedRootsPageResult =
  | { success: true; items: { id: string; name: string; childCount: number }[]; hasMore: boolean }
  | { success: false; error: string };

export type UnassignedSubprojectsPageResult =
  | { success: true; items: { id: string; name: string }[]; hasMore: boolean }
  | { success: false; error: string };

const PAGE_SIZE = 10;

async function assertCanManageTargetProjects(
  actorRole: Role,
  actorId: string,
  targetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = await prisma.user.findUnique({
    where:  { id: targetId },
    select: { id: true, role: true },
  });
  if (!target) return { ok: false, error: "User not found." };
  if (target.id === actorId) {
    return { ok: false, error: "You cannot change your own project assignments here." };
  }
  if (ROLE_RANK[actorRole] <= ROLE_RANK[target.role]) {
    return {
      ok: false,
      error: `A ${actorRole} cannot modify project access for a ${target.role}.`,
    };
  }
  return { ok: true };
}

async function assignedProjectIdsForUser(userId: string): Promise<string[]> {
  const rows = await prisma.projectMember.findMany({
    where:  { userId },
    select: { projectId: true },
  });
  return rows.map((r) => r.projectId);
}

async function userEmailForLog(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where:  { id: userId },
    select: { email: true },
  });
  return u?.email ?? userId;
}

/**
 * Assigns a project membership to a user (ADMIN / SUPERADMIN only; rank rules apply).
 */
export async function assignProjectToUser(
  targetUserId: string,
  projectId: string,
): Promise<ProjectAssignmentResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };
  if (!ASSIGN_ROLES.has(vault.user.role)) {
    return { success: false, error: "Only Admins and Superadmins can assign projects." };
  }

  const tid = targetUserId.trim();
  const pid = projectId.trim();
  if (!tid || !pid) return { success: false, error: "Invalid request." };

  const guard = await assertCanManageTargetProjects(vault.user.role, vault.user.id, tid);
  if (!guard.ok) return { success: false, error: guard.error };

  const project = await prisma.project.findFirst({
    where:  { id: pid, ...vaultWhereActive },
    select: { id: true },
  });
  if (!project) return { success: false, error: "Project not found." };

  await prisma.projectMember.upsert({
    where: {
      userId_projectId: { userId: tid, projectId: project.id },
    },
    update: {},
    create: { userId: tid, projectId: project.id },
  });

  const targetEmail = await userEmailForLog(tid);

  await logActivity({
    actorId:    vault.user.id,
    action:     ActivityAction.ASSIGN,
    entityType: "project_member",
    entityId:   project.id,
    label:      `Assigned ${targetEmail} to project`,
  });

  return { success: true };
}

/**
 * Assigns multiple projects in one request (e.g. selected subprojects).
 */
export async function assignProjectsToUserBatch(
  targetUserId: string,
  projectIds: string[],
): Promise<ProjectAssignmentResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };
  if (!ASSIGN_ROLES.has(vault.user.role)) {
    return { success: false, error: "Only Admins and Superadmins can assign projects." };
  }

  const tid = targetUserId.trim();
  if (!tid) return { success: false, error: "Invalid request." };

  const guard = await assertCanManageTargetProjects(vault.user.role, vault.user.id, tid);
  if (!guard.ok) return { success: false, error: guard.error };

  const ids = [...new Set(projectIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return { success: false, error: "No projects selected." };

  const existing = await prisma.project.findMany({
    where:  { id: { in: ids }, ...vaultWhereActive },
    select: { id: true },
  });
  if (existing.length !== ids.length) {
    return { success: false, error: "One or more projects were not found." };
  }

  await prisma.projectMember.createMany({
    data: ids.map((projectId) => ({ userId: tid, projectId })),
    skipDuplicates: true,
  });

  const batchTargetEmail = await userEmailForLog(tid);

  await logActivity({
    actorId:    vault.user.id,
    action:     ActivityAction.ASSIGN,
    entityType: "project_member",
    entityId:   tid,
    label:      `Assigned ${ids.length} project(s) to ${batchTargetEmail}`,
  });

  return { success: true };
}

/**
 * Removes project membership for a user.
 */
export async function removeProjectFromUser(
  targetUserId: string,
  projectId: string,
): Promise<ProjectAssignmentResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };
  if (!ASSIGN_ROLES.has(vault.user.role)) {
    return { success: false, error: "Only Admins and Superadmins can remove project assignments." };
  }

  const tid = targetUserId.trim();
  const pid = projectId.trim();
  if (!tid || !pid) return { success: false, error: "Invalid request." };

  const guard = await assertCanManageTargetProjects(vault.user.role, vault.user.id, tid);
  if (!guard.ok) return { success: false, error: guard.error };

  const result = await prisma.projectMember.deleteMany({
    where: { userId: tid, projectId: pid },
  });
  if (result.count === 0) {
    return { success: false, error: "No matching project assignment found for this user." };
  }

  const [removedUserEmail, removedFromProject] = await Promise.all([
    userEmailForLog(tid),
    prisma.project.findUnique({
      where:  { id: pid },
      select: { name: true },
    }),
  ]);

  const projectTail = removedFromProject?.name
    ? ` "${removedFromProject.name}"`
    : "";

  await logActivity({
    actorId:    vault.user.id,
    action:     ActivityAction.REMOVE,
    entityType: "project_member",
    entityId:   pid,
    label:      `Removed ${removedUserEmail} from project${projectTail}`,
  });

  // Notify the affected user so their client refreshes immediately
  eventBus.emit("vault_event", {
    type:    "ACCESS_REVOKED",
    userId:  tid,
    projectId: pid,
  });

  return { success: true };
}

/**
 * Removes the signed-in user’s own `ProjectMember` row for this project.
 * **USER**, **INTERN**, and **MODERATOR** only; requires a direct membership on this project.
 */
export async function leaveProject(projectId: string): Promise<ProjectAssignmentResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  if (!SELF_LEAVE_ROLES.has(vault.user.role)) {
    return {
      success: false,
      error: "Only Users, Interns, and Moderators can leave a project assignment.",
    };
  }

  const pid = projectId.trim();
  if (!pid) return { success: false, error: "Invalid project." };

  const result = await prisma.projectMember.deleteMany({
    where: { userId: vault.user.id, projectId: pid },
  });
  if (result.count === 0) {
    return { success: false, error: "You are not directly assigned to this project." };
  }

  await logActivity({
    actorId:    vault.user.id,
    action:     ActivityAction.LEAVE,
    entityType: "project_member",
    entityId:   pid,
    label:      "Left project assignment",
  });

  // Notify this user so open dashboards / project views refresh
  eventBus.emit("vault_event", {
    type:    "ACCESS_REVOKED",
    userId:  vault.user.id,
    projectId: pid,
  });

  return { success: true };
}

/**
 * Top-level projects only (for "Add more" — expand a row to pick subprojects).
 */
export async function listUnassignedRootProjectsPage(
  targetUserId: string,
  page: number,
): Promise<UnassignedRootsPageResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };
  if (!ASSIGN_ROLES.has(vault.user.role)) {
    return { success: false, error: "Only Admins and Superadmins can view project assignments." };
  }

  const tid = targetUserId.trim();
  if (!tid) return { success: false, error: "Invalid request." };

  const guard = await assertCanManageTargetProjects(vault.user.role, vault.user.id, tid);
  if (!guard.ok) return { success: false, error: guard.error };

  const safePage = Number.isFinite(page) && page >= 0 ? Math.floor(page) : 0;
  const skip = safePage * PAGE_SIZE;

  const rows = await prisma.project.findMany({
    where:    { parentId: null, ...vaultWhereActive },
    orderBy:  { name: "asc" },
    skip,
    take:     PAGE_SIZE + 1,
    select: {
      id: true,
      name: true,
      _count: { select: { children: true } },
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const slice = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return {
    success: true,
    items: slice.map((r) => ({
      id:         r.id,
      name:       r.name,
      childCount: r._count.children,
    })),
    hasMore,
  };
}

/**
 * Subprojects of a parent not yet assigned to the target user (lazy-loaded, 10 per page).
 */
export async function listUnassignedSubprojectsPage(
  targetUserId: string,
  parentProjectId: string,
  page: number,
): Promise<UnassignedSubprojectsPageResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };
  if (!ASSIGN_ROLES.has(vault.user.role)) {
    return { success: false, error: "Only Admins and Superadmins can view project assignments." };
  }

  const tid = targetUserId.trim();
  const pid = parentProjectId.trim();
  if (!tid || !pid) return { success: false, error: "Invalid request." };

  const guard = await assertCanManageTargetProjects(vault.user.role, vault.user.id, tid);
  if (!guard.ok) return { success: false, error: guard.error };

  const parent = await prisma.project.findFirst({
    where:  { id: pid, ...vaultWhereActive },
    select: { id: true },
  });
  if (!parent) return { success: false, error: "Project not found." };

  const assigned = await assignedProjectIdsForUser(tid);

  const safePage = Number.isFinite(page) && page >= 0 ? Math.floor(page) : 0;
  const skip = safePage * PAGE_SIZE;

  const where = {
    parentId: parent.id,
    ...vaultWhereActive,
    ...(assigned.length ? { id: { notIn: assigned } } : {}),
  };

  const rows = await prisma.project.findMany({
    where,
    orderBy: { name: "asc" },
    skip,
    take:    PAGE_SIZE + 1,
    select:  { id: true, name: true },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return { success: true, items, hasMore };
}

/**
 * @deprecated Use listUnassignedRootProjectsPage — kept for any stale imports.
 */
export async function listUnassignedProjectsPage(
  targetUserId: string,
  page: number,
): Promise<
  | { success: true; items: { id: string; name: string }[]; hasMore: boolean }
  | { success: false; error: string }
> {
  const res = await listUnassignedRootProjectsPage(targetUserId, page);
  if (!res.success) return res;
  return {
    success: true,
    hasMore: res.hasMore,
    items: res.items.map(({ id, name }) => ({ id, name })),
  };
}
