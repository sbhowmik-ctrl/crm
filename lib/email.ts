import nodemailer from "nodemailer";

const DEFAULT_FROM = "mitra.b.mukherjee@steorasystems.com";

export function getAppBaseUrl(): string {
  const u = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? process.env.VERCEL_URL;
  if (u) return u.startsWith("http") ? u : `https://${u}`;
  return "http://localhost:3000";
}

export type SendInviteEmailParams = {
  to:         string;
  inviteUrl:  string;
  roleLabel:  string;
  inviterName: string;
};

/**
 * Sends the vault invitation email. Requires SMTP env in production.
 * In development, if SMTP is missing, logs the link to the server console instead.
 */
export async function sendInviteEmail(params: SendInviteEmailParams): Promise<void> {
  const from = process.env.INVITE_FROM_EMAIL?.trim() || DEFAULT_FROM;
  const host = process.env.SMTP_HOST?.trim();

  const text = [
    `You've been invited to join the Credential Vault as ${params.roleLabel}.`,
    "",
    `Open this link to create your password and sign in:`,
    params.inviteUrl,
    "",
    `This link expires in 7 days. If you didn't expect this email, you can ignore it.`,
  ].join("\n");

  const html = `
    <p>You've been invited to join the <strong>Credential Vault</strong> as <strong>${escapeHtml(params.roleLabel)}</strong>.</p>
    <p><a href="${escapeHtml(params.inviteUrl)}">Accept invitation</a></p>
    <p style="color:#666;font-size:12px;">Invited by ${escapeHtml(params.inviterName)}. This link expires in 7 days.</p>
  `;

  if (!host) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[invite] SMTP_HOST is not set — invitation link (dev only):\n",
        params.inviteUrl,
      );
      return;
    }
    throw new Error(
      "Email is not configured. Set SMTP_HOST (and SMTP_USER / SMTP_PASS) to send invitations.",
    );
  }

  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });

  await transporter.sendMail({
    from:    `"Credential Vault" <${from}>`,
    to:      params.to,
    subject: "You're invited to Credential Vault",
    text,
    html,
  });
}

export type PendingApprovalEmailParams = {
  toAddresses:    string[];
  kind:           "secret" | "note" | "credential_key";
  summaryLine:    string;
  submitterLabel: string;
};

/**
 * Notifies ADMIN/SUPERADMIN recipients that a USER submitted content for approval.
 */
export async function sendPendingApprovalNotificationEmail(
  params: PendingApprovalEmailParams,
): Promise<void> {
  const valid = params.toAddresses.map((e) => e.trim()).filter(Boolean);
  if (valid.length === 0) {
    console.warn("[pending-approval] No admin emails to notify.");
    return;
  }

  const base = getAppBaseUrl().replace(/\/$/, "");
  const approvalsUrl = `${base}/dashboard/approvals`;
  const kindLabel =
    params.kind === "secret"
      ? "environment secret"
      : params.kind === "credential_key"
        ? "credential key"
        : "note";

  const text = [
    `A user (${params.submitterLabel}) submitted a ${kindLabel} for approval.`,
    params.summaryLine,
    "",
    `Review and approve or reject in the dashboard:`,
    approvalsUrl,
  ].join("\n");

  const html = `
    <p>A user (<strong>${escapeHtml(params.submitterLabel)}</strong>) submitted a <strong>${escapeHtml(kindLabel)}</strong> for approval.</p>
    <p>${escapeHtml(params.summaryLine)}</p>
    <p><a href="${escapeHtml(approvalsUrl)}">Open approvals</a></p>
  `;

  const from = process.env.INVITE_FROM_EMAIL?.trim() || DEFAULT_FROM;
  const host = process.env.SMTP_HOST?.trim();

  if (!host) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[pending-approval] SMTP_HOST not set — approvals URL (dev):\n", approvalsUrl);
    }
    return;
  }

  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });

  await transporter.sendMail({
    from:    `"Credential Vault" <${from}>`,
    to:      valid.join(", "),
    subject: `[Credential Vault] Approval needed: ${
      params.kind === "secret" ? "Secret" : params.kind === "credential_key" ? "Credential key" : "Note"
    }`,
    text,
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
