# Credential Vault

A secure, self-hosted credential management dashboard built with Next.js 16, Auth.js v5, Prisma 7, and PostgreSQL. Store environment variables, credential keys, and team notes behind AES-256-GCM encryption with fine-grained role-based and per-user access control.

## Features

* **AES-256-GCM encrypted secrets** — values are encrypted at rest; the plaintext never leaves the server.
* **Project & Subproject organization** — group secrets and notes under hierarchical named projects.
* **Credential Sections** — organize standalone key-value credentials into global sections outside of projects.
* **Approval Workflows** — Users submit secrets, notes, and credential keys to a pending queue for Admin/Superadmin approval.
* **General & Project-Based Notes** — create standalone notes or link them to specific project hierarchies.
* **Activity Audit Log** — tracks all vault operations including creates, updates, deletes, and access changes.
* **Email Invitations** — administrators can invite new users via secure email tokens.
* **Live role & access sync** — Server-Sent Events (SSE) instantly broadcast access revocations and role changes without requiring a page refresh or re-login.
* **Archiving** — soft-delete projects, notes, and credential sections to declutter the workspace without permanent data loss.
* **Import `.env` files** — paste or upload a `.env` file; preview parsed key-value pairs before saving or submitting for approval.

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **Auth** | Auth.js v5 (NextAuth) — Credentials provider + JWT |
| **ORM** | Prisma 7 |
| **Database** | PostgreSQL |
| **Encryption** | AES-256-GCM via Node.js `crypto` |
| **UI** | Tailwind CSS v4 + Base UI + Shadcn/ui |
| **Toasts** | Sonner |

## Role Hierarchy

| Role | Permissions |
| :--- | :--- |
| **SUPERADMIN** | Full access to everything, manages all user ranks, and approves pending submissions. |
| **ADMIN** | Full CRUD on projects, secrets, and notes; approves submissions; manages users below ADMIN level. |
| **MODERATOR** | Create, edit, and delete secrets/notes within explicitly assigned project scopes; manages per-record sharing. |
| **USER** | Read and copy items they have access to; submits new secrets, notes, and credentials to the approval queue. |
| **INTERN** | Read-only and copy access within scope; cannot submit items for approval or edit records. |

*Note: Roles are enforced server-side on every action. No client-side trust.*

## Prerequisites

* Node.js 20+
* PostgreSQL 14+
* SMTP Server (Required for sending email invitations)

## Setup

### 1. Clone the repository
```bash
git clone [https://github.com/your-username/credential-vault.git](https://github.com/your-username/credential-vault.git)
cd credential-vault
