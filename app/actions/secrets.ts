"use server";

import { z } from "zod";
import { ActivityAction, Role } from "@prisma/client";

import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { assertActiveVaultSession } from "@/lib/session-guards";
import { encryptValue } from "@/lib/crypto";
import { canUserPerformAction } from "@/lib/permissions";
import { sendPendingApprovalNotificationEmail } from "@/lib/email";
import {
  assertModeratorAssignedToProject,
  assertUserInternAssignedToProject,
} from "@/lib/project-scope-guards";
import { vaultWhereActive } from "@/lib/vault-entity-status";
import type { EnvPair } from "@/lib/env-parser";
import { eventBus } from "@/lib/event-bus";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const SaveSecretSchema = z.object({
  /** The secret's name/key, e.g. "DATABASE_URL" or "STRIPE_SECRET_KEY". */
  key: z.string().min(1, "Key must not be empty."),
  /** The plaintext secret value to encrypt and store. */
  value: z.string().min(1, "Value must not be empty."),
  /** The ID of the project this secret belongs to. */
  projectId: z.string().min(1, "Project ID must not be empty."),
  environment: z.string().min(1, "Environment name is required."),
});

export type SaveSecretInput = z.infer<typeof SaveSecretSchema>;

// ---------------------------------------------------------------------------
// Return type — discriminated union so callers can exhaustively handle both paths
// ---------------------------------------------------------------------------

export type SaveSecretResult =
  | { success: true; data: { id: string }; pendingApproval?: boolean }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------------

/**
 * Validates, trims, encrypts, and persists a secret tied to a project.
 *
 * Guards:
 * 1. User must be authenticated.
 * 2. User's role must be MODERATOR or above (enforced by canUserPerformAction).
 * 3. The referenced project must exist.
 * 4. Encryption must succeed before any DB write is attempted.
 */
export async function saveSecret(
  rawInput: SaveSecretInput
): Promise<SaveSecretResult> {
  // ------------------------------------------------------------------
  // 1. Authentication — reject unauthenticated callers immediately.
  // ------------------------------------------------------------------
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) {
    return { success: false, error: vault.error };
  }

  // ------------------------------------------------------------------
  // 2. Trim + validate — all string fields are trimmed before validation
  //    so Zod's min(1) also rejects whitespace-only input.
  // ------------------------------------------------------------------
  const parsed = SaveSecretSchema.safeParse({
    key:       rawInput.key?.trim(),
    value:     rawInput.value?.trim(),
    projectId: rawInput.projectId?.trim(),
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join(" | ");
    return { success: false, error: message };
  }

  const { key, value, projectId } = parsed.data;

  const actor = { id: vault.user.id, role: vault.user.role };

  if (actor.role === Role.INTERN) {
    return { success: false, error: "Interns cannot add secrets." };
  }

  const project = await prisma.project.findFirst({
    where:  { id: projectId, ...vaultWhereActive },
    select: { id: true, name: true },
  });

  if (!project) {
    return { success: false, error: `Project "${projectId}" not found.` };
  }

  // USER — submit for admin approval (not added to vault until approved).
  if (actor.role === Role.USER) {
    const scope = await assertUserInternAssignedToProject(actor, projectId);
    if (!scope.ok) return { success: false, error: scope.error };

    const { encryptedValue, iv } = encryptValue(value);

    const pending = await prisma.pendingSecretSubmission.create({
      data: {
        submitterId: actor.id,
        projectId,
        key,
        encryptedValue,
        iv,
      },
      select: { id: true },
    });

    await logActivity({
      actorId:    vault.user.id,
      action:     ActivityAction.CREATE,
      entityType: "pending_secret",
      entityId:   pending.id,
      label:      `${project.name} — ${key}`,
    });

    const admins = await prisma.user.findMany({
      where: { isActive: true, role: { in: [Role.ADMIN, Role.SUPERADMIN] } },
      select: { email: true },
    });

    await sendPendingApprovalNotificationEmail({
      toAddresses:    admins.map((a) => a.email),
      kind:           "secret",
      summaryLine:    `Project: ${project.name} — key: ${key}`,
      submitterLabel: vault.user.email ?? vault.user.id,
    }).catch(() => {});

    return { success: true, data: { id: pending.id }, pendingApproval: true };
  }

  if (!canUserPerformAction(actor, null, "secret", "create")) {
    return {
      success: false,
      error: `Role "${vault.user.role}" is not permitted to create secrets.`,
    };
  }

  const scope = await assertModeratorAssignedToProject(actor, projectId);
  if (!scope.ok) return { success: false, error: scope.error };

  const { encryptedValue, iv } = encryptValue(value);

  const secret = await prisma.secret.create({
    data: {
      key,
      encryptedValue,
      iv,
      projectId,
      ownerId: vault.user.id,
    },
    select: { id: true },
  });

  await logActivity({
    actorId:    vault.user.id,
    action:     ActivityAction.CREATE,
    entityType: "secret",
    entityId:   secret.id,
    label:      key,
  });

  return { success: true, data: { id: secret.id } };
}

// ---------------------------------------------------------------------------
// Bulk import — saveSecretsFromEnv
// ---------------------------------------------------------------------------

export type SecretImportOutcome =
  | { key: string; status: "saved"; id: string }
  | { key: string; status: "pending"; id: string }
  | { key: string; status: "failed"; error: string };

export type SaveSecretsFromEnvResult =
  | { success: true;  outcomes: SecretImportOutcome[] }
  | { success: false; error: string };

/**
 * Encrypts and saves a batch of key-value pairs (parsed from a .env file)
 * as individual Secret records linked to the given project.
 *
 * Each pair is encrypted independently so a single failure does not block
 * the rest. The DB writes run inside a transaction — if the transaction
 * itself fails (e.g. DB connection lost) all writes are rolled back.
 *
 * @param pairs     - Pre-parsed, pre-trimmed { key, value } pairs.
 * @param projectId - The project these secrets belong to.
 */
export async function saveSecretsFromEnv(
  pairs: Pick<EnvPair, "key" | "value">[],
  projectId: string,
  environment: string,
): Promise<SaveSecretsFromEnvResult> {
  // ------------------------------------------------------------------
  // 1. Auth
  // ------------------------------------------------------------------
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) {
    return { success: false, error: vault.error };
  }

  // ------------------------------------------------------------------
  // 2. Permission
  // ------------------------------------------------------------------
  const actor = { id: vault.user.id, role: vault.user.role };

  if (actor.role === Role.INTERN) {
    return { success: false, error: "Interns cannot add secrets." };
  }

  const isUserPending = actor.role === Role.USER;

  // ------------------------------------------------------------------
  // 3. Basic input guards
  // ------------------------------------------------------------------
  const trimmedProjectId = projectId?.trim();
  if (!trimmedProjectId) {
    return { success: false, error: "Project ID must not be empty." };
  }

  if (!Array.isArray(pairs) || pairs.length === 0) {
    return { success: false, error: "No pairs provided." };
  }

  // ------------------------------------------------------------------
  // 4. Project existence
  // ------------------------------------------------------------------
  const project = await prisma.project.findFirst({
    where:  { id: trimmedProjectId, ...vaultWhereActive },
    select: { id: true, name: true },
  });
  if (!project) {
    return { success: false, error: `Project "${trimmedProjectId}" not found.` };
  }

  if (isUserPending) {
    const scope = await assertUserInternAssignedToProject(actor, trimmedProjectId);
    if (!scope.ok) return { success: false, error: scope.error };
  } else {
    if (!canUserPerformAction(actor, null, "secret", "create")) {
      return {
        success: false,
        error: `Role "${vault.user.role}" is not permitted to create secrets.`,
      };
    }

    const scope = await assertModeratorAssignedToProject(actor, trimmedProjectId);
    if (!scope.ok) return { success: false, error: scope.error };
  }

  // ------------------------------------------------------------------
  // 5. Encrypt every pair before touching the DB.
  //    Capture per-key errors so one bad value doesn't abort the batch.
  // ------------------------------------------------------------------
  type ReadyRow = {
    key: string;
    encryptedValue: string;
    iv: string;
  };

  const ready: ReadyRow[]         = [];
  const outcomes: SecretImportOutcome[] = [];

  for (const pair of pairs) {
    const key   = pair.key.trim();
    const value = pair.value.trim();

    if (!key) {
      outcomes.push({ key: "(empty)", status: "failed", error: "Key is empty." });
      continue;
    }

    try {
      const { encryptedValue, iv } = encryptValue(value);
      ready.push({ key, encryptedValue, iv });
    } catch (err) {
      outcomes.push({
        key,
        status: "failed",
        error: err instanceof Error ? err.message : "Encryption failed.",
      });
    }
  }

  // ------------------------------------------------------------------
  // 6. Persist all successfully encrypted rows in one transaction.
  // ------------------------------------------------------------------
  if (ready.length > 0) {
    const submitterId = vault.user.id;

    if (isUserPending) {
      const created = await prisma.$transaction(async (tx) => {
        const rows: { id: string; key: string }[] = [];
        for (const row of ready) {
          const pending = await tx.pendingSecretSubmission.create({
            data: {
              submitterId,
              projectId: trimmedProjectId,
              environment,
              key: row.key,
              encryptedValue: row.encryptedValue,
              iv: row.iv,
            },
            select: { id: true, key: true },
          });
          rows.push(pending);
        }
        return rows;
      });

      for (const row of created) {
        outcomes.push({ key: row.key, status: "pending", id: row.id });
      }

      // Notify admins (single email for the batch).
      const admins = await prisma.user.findMany({
        where: { isActive: true, role: { in: [Role.ADMIN, Role.SUPERADMIN] } },
        select: { email: true },
      });

      await sendPendingApprovalNotificationEmail({
        toAddresses: admins.map((a) => a.email),
        kind: "secret",
        summaryLine: `Project: ${project.name} — ${created.length} secret(s) pending approval`,
        submitterLabel: vault.user.email ?? vault.user.id,
      }).catch(() => {});

      // Activity — log each pending row so the exact ids can be referenced later.
      for (const row of created) {
        await logActivity({
          actorId: submitterId,
          action: ActivityAction.CREATE,
          entityType: "pending_secret",
          entityId: row.id,
          label: row.key,
        });
      }
    } else {
      const created = await prisma.$transaction(
        ready.map((row) =>
          prisma.secret.create({
            data: {
              key: row.key,
              environment,
              encryptedValue: row.encryptedValue,
              iv: row.iv,
              projectId: trimmedProjectId,
              ownerId: submitterId,
            },
            select: { id: true, key: true },
          }),
        ),
      );

      for (const row of created) {
        outcomes.push({ key: row.key, status: "saved", id: row.id });
      }

      await logActivity({
        actorId: submitterId,
        action: ActivityAction.CREATE,
        entityType: "secret",
        entityId: trimmedProjectId,
        label: `Imported ${created.length} secret(s) from .env`,
      });
    }
  }

  return { success: true, outcomes };
}

// ---------------------------------------------------------------------------
// Update secret
// ---------------------------------------------------------------------------

const UpdateSecretSchema = z.object({
  secretId: z.string().min(1, "Secret ID must not be empty."),
  key:      z.string().min(1, "Key must not be empty."),
  value:    z.string().min(1, "Value must not be empty."),
  environment: z.string().trim().min(1, "Environment must not be empty."),
});

export type UpdateSecretInput  = z.infer<typeof UpdateSecretSchema>;
export type UpdateSecretResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Updates a secret's key and/or value.
 * Re-encrypts the value with a fresh IV on every edit.
 * Requires MODERATOR or above.
 */
export async function updateSecret(
  rawInput: UpdateSecretInput,
): Promise<UpdateSecretResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  const parsed = UpdateSecretSchema.safeParse({
    secretId:    rawInput.secretId?.trim(),
    key:         rawInput.key?.trim(),
    value:       rawInput.value?.trim(),
    environment: rawInput.environment,
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(" | ") };
  }

  const { secretId, key, value, environment } = parsed.data;
  const actor = { id: vault.user.id, role: vault.user.role };

  if (!canUserPerformAction(actor, null, "secret", "update")) {
    return {
      success: false,
      error: `Role "${vault.user.role}" is not permitted to edit secrets.`,
    };
  }

  const existing = await prisma.secret.findFirst({
    where:  { id: secretId, project: { is: vaultWhereActive } },
    select: { id: true, projectId: true },
  });
  if (!existing) return { success: false, error: "Secret not found." };

  const scope = await assertModeratorAssignedToProject(actor, existing.projectId);
  if (!scope.ok) return { success: false, error: scope.error };

  const { encryptedValue, iv } = encryptValue(value);

  await prisma.secret.update({
    where: { id: secretId },
    data:  { key, encryptedValue, iv, environment },
  });

  await logActivity({
    actorId:    vault.user.id,
    action:     ActivityAction.UPDATE,
    entityType: "secret",
    entityId:   secretId,
    label:      key,
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete secret
// ---------------------------------------------------------------------------

export type DeleteSecretResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Deletes a single secret.
 * Requires MODERATOR or above.
 */
export async function deleteSecret(secretId: string): Promise<DeleteSecretResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  const actor = { id: vault.user.id, role: vault.user.role };
  if (!canUserPerformAction(actor, null, "secret", "delete")) {
    return {
      success: false,
      error: `Role "${vault.user.role}" is not permitted to delete secrets.`,
    };
  }

  const secret = await prisma.secret.findFirst({
    where:  { id: secretId, project: { is: vaultWhereActive } },
    select: { id: true, projectId: true, key: true },
  });
  if (!secret) return { success: false, error: "Secret not found." };

  const scope = await assertModeratorAssignedToProject(actor, secret.projectId);
  if (!scope.ok) return { success: false, error: scope.error };

  await prisma.secret.delete({ where: { id: secretId } });

  await logActivity({
    actorId:    vault.user.id,
    action:     ActivityAction.DELETE,
    entityType: "secret",
    entityId:   secretId,
    label:      secret.key,
  });

  eventBus.emit("vault_event", {
    type: "SECRET_DELETED",
    projectId: secret.projectId,
  });

  return { success: true };
}

const RenameEnvironmentSchema = z.object({
  projectId: z.string().trim().min(1, "Project ID must not be empty."),
  fromEnvironment: z.string().trim().min(1, "Current name must not be empty."),
  toEnvironment: z.string().trim().min(1, "New name must not be empty."),
});

export type RenameEnvironmentResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Renames a secrets section by updating the `environment` field on all secrets
 * in that section. Allowed for project-member USERs and for roles that may
 * edit secrets (MODERATOR+); interns cannot rename.
 */
export async function renameEnvironment(
  projectId: string,
  fromEnvironment: string,
  toEnvironment: string,
): Promise<RenameEnvironmentResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  const parsed = RenameEnvironmentSchema.safeParse({
    projectId,
    fromEnvironment,
    toEnvironment,
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(" | ") };
  }

  const {
    projectId: pid,
    fromEnvironment: fromEnv,
    toEnvironment: toEnv,
  } = parsed.data;

  if (fromEnv === toEnv) {
    return { success: true };
  }

  const actor = { id: vault.user.id, role: vault.user.role };

  if (actor.role === Role.INTERN) {
    return { success: false, error: "Interns cannot rename sections." };
  }

  if (actor.role === Role.USER) {
    const scope = await assertUserInternAssignedToProject(actor, pid);
    if (!scope.ok) return { success: false, error: scope.error };
  } else {
    if (!canUserPerformAction(actor, null, "secret", "update")) {
      return {
        success: false,
        error: `Role "${vault.user.role}" is not permitted to rename sections.`,
      };
    }
    const scope = await assertModeratorAssignedToProject(actor, pid);
    if (!scope.ok) return { success: false, error: scope.error };
  }

  const project = await prisma.project.findFirst({
    where: { id: pid, ...vaultWhereActive },
    select: { id: true },
  });
  if (!project) {
    return { success: false, error: "Project not found or not available." };
  }

  const existingTarget = await prisma.secret.findFirst({
    where: { projectId: pid, environment: toEnv },
    select: { id: true },
  });
  if (existingTarget) {
    return {
      success: false,
      error: `A section named "${toEnv}" already exists in this project.`,
    };
  }

  const result = await prisma.secret.updateMany({
    where: { projectId: pid, environment: fromEnv },
    data: { environment: toEnv },
  });

  if (result.count === 0) {
    return {
      success: false,
      error: "No secrets found in that section. Try refreshing the page.",
    };
  }

  await logActivity({
    actorId: vault.user.id,
    action: ActivityAction.UPDATE,
    entityType: "secret",
    entityId: pid,
    label: `Renamed section "${fromEnv}" → "${toEnv}" (${result.count} secret(s))`,
  });

  return { success: true };
}

/**
 * Deletes all secrets within a specific environment for a project.
 * Requires MODERATOR or above.
 */
export async function deleteEnvironment(projectId: string, environment: string): Promise<DeleteSecretResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  const actor = { id: vault.user.id, role: vault.user.role };
  if (!canUserPerformAction(actor, null, "secret", "delete")) {
    return {
      success: false,
      error: `Role "${vault.user.role}" is not permitted to delete secrets.`,
    };
  }

  const scope = await assertModeratorAssignedToProject(actor, projectId);
  if (!scope.ok) return { success: false, error: scope.error };

  const deleted = await prisma.secret.deleteMany({
    where: { projectId, environment },
  });

  if (deleted.count > 0) {
    await logActivity({
      actorId:    vault.user.id,
      action:     ActivityAction.DELETE,
      entityType: "secret",
      entityId:   projectId,
      label:      `Deleted section "${environment}" (${deleted.count} secrets)`,
    });

    eventBus.emit("vault_event", {
      type: "SECRET_DELETED",
      projectId,
    });
  }

  return { success: true };
}