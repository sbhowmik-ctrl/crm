# 🔐 Credential Vault

A secure, self-hosted credential management dashboard built to store environment variables, credential keys, and team notes behind AES-256-GCM encryption. It features fine-grained, role-based, and per-user access control, ensuring your team's most sensitive data remains secure and organized.

## ✨ Core Features

* **Zero Plaintext in DOM:** Secrets are encrypted at rest using AES-256-GCM. Decryption happens entirely server-side, and plaintext values are written directly to the user's clipboard without ever lingering in the browser DOM.
* **Approval Workflows:** Users can submit new secrets, notes, and credentials to a pending queue. Administrators review, approve, or reject these submissions before they go live.
* **Project Hierarchy:** Organize secrets and notes into structured Projects and Subprojects.
* **Global Credential Sections:** Manage standalone, global key-value credentials outside of specific project scopes.
* **Live Access Sync (SSE):** Server-Sent Events instantly broadcast access revocations, role changes, and deletions across active sessions without requiring a page refresh.
* **Bulk `.env` Import:** Drag and drop `.env` files to parse, preview, and securely import multiple key-value pairs at once.
* **Activity Audit Log:** Comprehensive tracking of all vault operations (creates, updates, deletes, and access grants).
* **Email Invitations:** Secure, token-based email invitations for onboarding new team members.

---

## 🛠️ Tech Stack

* **Framework:** Next.js 16 (App Router)
* **Language:** TypeScript
* **Authentication:** Auth.js v5 (NextAuth) with Google OAuth
* **Database & ORM:** PostgreSQL + Prisma 7
* **Encryption:** Native Node.js `crypto` (AES-256-GCM)
* **Styling & UI:** Tailwind CSS v4, Base UI, Shadcn/ui, Lucide Icons
* **Notifications:** Sonner (Toasts), Nodemailer (Emails)

---

## 🛡️ Role Hierarchy & Permissions

The vault utilizes a strict server-side Role-Based Access Control (RBAC) system. 

| Role | Permissions |
| :--- | :--- |
| **SUPERADMIN** | Full, unrestricted access to all projects, secrets, and notes. Manages all user ranks and approves pending submissions. |
| **ADMIN** | Full CRUD on projects, secrets, and notes. Approves submissions and manages users (Moderator and below). |
| **MODERATOR** | Can create, edit, and delete secrets/notes *only* within explicitly assigned project scopes. Manages per-record sharing. |
| **USER** | Read and copy access to assigned items. Can submit new secrets, notes, and credentials to the approval queue. |
| **INTERN** | Read-only and copy access within assigned scope. Cannot submit items for approval or edit any records. |

---

## 🚀 Getting Started

### 1. Prerequisites
* Node.js 20+
* PostgreSQL 14+
* A Google Cloud Console project (for OAuth credentials)
* An SMTP Server (for sending email invitations)

### 2. Clone the Repository
```bash
git clone https://github.com/your-username/credential-vault.git
cd credential-vault
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory. You will need to generate two 64-character hex strings (32 bytes) for encryption. You can generate them by running:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Populate your `.env` with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/credential_vault"

# Encryption Keys (Must be exactly 64 hex characters)
ENCRYPTION_KEY="your_64_char_hex_string_here"
MASTER_KEY="your_64_char_hex_string_here"

# Authentication (Auth.js)
AUTH_SECRET="your_auth_js_secret"
AUTH_URL="http://localhost:3000"

# Google OAuth
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"

# SMTP / Email
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="your_smtp_user"
SMTP_PASS="your_smtp_password"
SMTP_SECURE="false"
INVITE_FROM_EMAIL="vault@yourdomain.com"
```

### 4. Database Setup
Initialize the database schema using Prisma migrations (do not use `db push` for production schemas):

```bash
# Apply migrations
npm run db:migrate

# (Optional) Seed the database with default roles and a test project
npx tsx prisma/seed.ts
```

### 5. Run the Application

```bash
# Start the development server
npm run dev
```
The app will be available at `http://localhost:3000`.

---

## 🔒 Security Architecture Notes

* **Encryption at Rest:** All secrets and credentials are encrypted using `AES-256-GCM` before hitting the database. The `encryptedValue` and initialization vector (`iv`) are stored, along with an authentication tag to prevent tampering.
* **No Plaintext Leaks:** API responses for list views deliberately omit ciphertext. The `RevealButton` and `CopyButton` components fetch decrypted values via isolated Server Actions that hold the plaintext in memory just long enough to write to the clipboard.
* **Guarded Mutations:** Every server action strictly verifies the user's active session, role rank, and project-specific assignment scope before executing reads or writes. 
