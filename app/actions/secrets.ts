"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptValue } from "@/lib/crypto";
import { canUserPerformAction } from "@/lib/permissions";
import type { EnvPair } from "@/lib/env-parser";

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
});

export type SaveSecretInput = z.infer<typeof SaveSecretSchema>;

// ---------------------------------------------------------------------------
// Return type — discriminated union so callers can exhaustively handle both paths
// ---------------------------------------------------------------------------

export type SaveSecretResult =
  | { success: true;  data: { id: string } }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------------

/**
 * Validates, trims, encrypts, and persists a secret tied to a project.
 *
 * Guards:
 *  1. User must be authenticated.
 *  2. User's role must be MODERATOR or above (enforced by canUserPerformAction).
 *  3. The referenced project must exist.
 *  4. Encryption must succeed before any DB write is attempted.
 */
export async function saveSecret(
  rawInput: SaveSecretInput
): Promise<SaveSecretResult> {
  // ------------------------------------------------------------------
  // 1. Authentication — reject unauthenticated callers immediately.
  // ------------------------------------------------------------------
  const session = await auth();

  if (!session?.user) {
    return { success: false, error: "Unauthorized. Please sign in." };
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

  // ------------------------------------------------------------------
  // 3. Authorisation — MODERATOR and above may create secrets.
  // ------------------------------------------------------------------
  const actor = { id: session.user.id, role: session.user.role };

  if (!canUserPerformAction(actor, null, "secret", "create")) {
    return {
      success: false,
      error: `Role "${session.user.role}" is not permitted to create secrets.`,
    };
  }

  // ------------------------------------------------------------------
  // 4. Verify the project exists before doing any crypto work.
  // ------------------------------------------------------------------
  const project = await prisma.project.findUnique({
    where:  { id: projectId },
    select: { id: true },
  });

  if (!project) {
    return { success: false, error: `Project "${projectId}" not found.` };
  }

  // ------------------------------------------------------------------
  // 5. Encrypt — uses AES-256-GCM via lib/crypto.ts.
  //    encryptValue returns { encryptedValue, iv } which maps directly to
  //    the Secret model's columns.
  // ------------------------------------------------------------------
  const { encryptedValue, iv } = encryptValue(value);

  // ------------------------------------------------------------------
  // 6. Persist — only the owner ID, project link, and ciphertext are stored.
  //    The plaintext never touches the database.
  // ------------------------------------------------------------------
  const secret = await prisma.secret.create({
    data: {
      key,
      encryptedValue,
      iv,
      projectId,
      ownerId: session.user.id,
    },
    select: { id: true },
  });

  return { success: true, data: { id: secret.id } };
}

// ---------------------------------------------------------------------------
// Bulk import — saveSecretsFromEnv
// ---------------------------------------------------------------------------

export type SecretImportOutcome =
  | { key: string; status: "saved";  id: string }
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
): Promise<SaveSecretsFromEnvResult> {
  // ------------------------------------------------------------------
  // 1. Auth
  // ------------------------------------------------------------------
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  // ------------------------------------------------------------------
  // 2. Permission
  // ------------------------------------------------------------------
  const actor = { id: session.user.id, role: session.user.role };
  if (!canUserPerformAction(actor, null, "secret", "create")) {
    return {
      success: false,
      error: `Role "${session.user.role}" is not permitted to create secrets.`,
    };
  }

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
  const project = await prisma.project.findUnique({
    where:  { id: trimmedProjectId },
    select: { id: true },
  });
  if (!project) {
    return { success: false, error: `Project "${trimmedProjectId}" not found.` };
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
    const ownerId = session.user.id;

    const created = await prisma.$transaction(
      ready.map((row) =>
        prisma.secret.create({
          data: {
            key:            row.key,
            encryptedValue: row.encryptedValue,
            iv:             row.iv,
            projectId:      trimmedProjectId,
            ownerId,
          },
          select: { id: true, key: true },
        }),
      ),
    );

    for (const row of created) {
      outcomes.push({ key: row.key, status: "saved", id: row.id });
    }
  }

  return { success: true, outcomes };
}
