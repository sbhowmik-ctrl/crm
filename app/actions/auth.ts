"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Register (browser signs in via next-auth/react after success - see register page.)
// ---------------------------------------------------------------------------

const RegisterSchema = z.object({
  name:            z.string().trim().min(1, "Name is required."),
  email:           z.string().trim().toLowerCase().email("Enter a valid email address."),
  password:        z.string().min(8, "Password must be at least 8 characters."),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export type RegisterResult =
  | { success: true }
  | { success: false; error: string };

export async function registerAction(
  _prev: RegisterResult | null,
  formData: FormData
): Promise<RegisterResult> {
  const raw = {
    name:            formData.get("name")            as string,
    email:           formData.get("email")           as string,
    password:        formData.get("password")        as string,
    confirmPassword: formData.get("confirmPassword") as string,
  };

  const parsed = RegisterSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { success: false, error: first?.message ?? "Invalid input." };
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "An account with that email already exists." };
  }

  const pendingInvite = await prisma.userInvitation.findFirst({
    where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (pendingInvite) {
    return {
      success: false,
      error: "An invitation is pending for this email. Check your inbox or ask an admin to resend.",
    };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: { name, email, passwordHash },
  });

  return { success: true };
}
