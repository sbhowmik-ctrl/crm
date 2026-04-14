"use server";

import { randomBytes } from "crypto";
import { z } from "zod";
import { ActivityAction, Role } from "@prisma/client";

import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { getAppBaseUrl, sendInviteEmail } from "@/lib/email";
import { getInviteAssignableRoles } from "@/lib/invite-roles";
import { prisma } from "@/lib/prisma";
import { assertActiveVaultSession } from "@/lib/session-guards";

const ADMIN_INVITE_ROLES = new Set<Role>([Role.ADMIN, Role.SUPERADMIN]);

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteUserResult =
  | { success: true }
  | { success: false; error: string };

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role:  z.nativeEnum(Role),
});

/**
 * ADMIN / SUPERADMIN only. Sends an email with a link to complete signup.
 */
export async function inviteUser(_prev: InviteUserResult | null, formData: FormData): Promise<InviteUserResult> {
  const session = await auth();
  const vault = assertActiveVaultSession(session);
  if (!vault.ok) return { success: false, error: vault.error };

  const actor = vault.user;
  if (!ADMIN_INVITE_ROLES.has(actor.role)) {
    return { success: false, error: "Only Admins and Superadmins can invite users." };
  }

  const parsed = InviteSchema.safeParse({
    email: formData.get("email"),
    role:  formData.get("role"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { email, role } = parsed.data;

  const assignable = getInviteAssignableRoles(actor.role);
  if (!assignable.includes(role)) {
    return { success: false, error: "You cannot assign that role." };
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { success: false, error: "A user with that email already exists." };
  }

  await prisma.userInvitation.deleteMany({
    where: { email, acceptedAt: null },
  });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  await prisma.userInvitation.create({
    data: {
      token,
      email,
      role,
      invitedById: actor.id,
      expiresAt,
    },
  });

  const base = getAppBaseUrl();
  const inviteUrl = `${base.replace(/\/$/, "")}/invite/accept?token=${encodeURIComponent(token)}`;

  const inviterName = actor.name?.trim() || actor.email || "An administrator";

  try {
    await sendInviteEmail({
      to:          email,
      inviteUrl,
      roleLabel:   role,
      inviterName,
    });
  } catch (err) {
    await prisma.userInvitation.delete({ where: { token } }).catch(() => {});
    const msg = err instanceof Error ? err.message : "Failed to send invitation email.";
    return { success: false, error: msg };
  }

  await logActivity({
    actorId:    actor.id,
    action:     ActivityAction.CREATE,
    entityType: "invitation",
    entityId:   email,
    label:      `Invited as ${role}`,
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Accept invitation (public)
// ---------------------------------------------------------------------------

const AcceptSchema = z.object({
  token: z.string().min(1, "Invalid invitation link."),
});

export type AcceptInvitationResult =
  | { success: true }
  | { success: false; error: string };

export async function acceptInvitation(
  _prev: AcceptInvitationResult | null,
  formData: FormData,
): Promise<AcceptInvitationResult> {
  const parsed = AcceptSchema.safeParse({
    token: formData.get("token"),
  });
  
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { token } = parsed.data;

  const invitation = await prisma.userInvitation.findUnique({
    where: { token },
    select: {
      id:          true,
      email:       true,
      role:        true,
      expiresAt:   true,
      acceptedAt:  true,
      invitedById: true,
    },
  });

  if (!invitation) {
    return { success: false, error: "This invitation is invalid or has already been used." };
  }
  if (invitation.acceptedAt) {
    return { success: false, error: "This invitation has already been accepted." };
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    return { success: false, error: "This invitation has expired. Ask your administrator to send a new one." };
  }

  const email = invitation.email;

  // Pre-create or update the user so Auth.js links to it when they sign in with Google
  const user = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({ where: { email } });
    
    let u;
    if (existingUser) {
      // Upgrade existing user to the invited role
      u = await tx.user.update({
        where: { email },
        data: { role: invitation.role }
      });
    } else {
      // Pre-create user without a password
      u = await tx.user.create({
        data: { email, role: invitation.role }
      });
    }

    await tx.userInvitation.update({
      where: { id: invitation.id },
      data:  { acceptedAt: new Date() },
    });

    return u;
  });

  await logActivity({
    actorId:    user.id,
    action:     ActivityAction.UPDATE,
    entityType: "user",
    entityId:   user.id,
    label:      `${email} accepted the invitation as ${invitation.role}`,
  });

  return { success: true };
}