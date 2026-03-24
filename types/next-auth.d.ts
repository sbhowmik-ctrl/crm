import { Role } from "@prisma/client";
import { DefaultSession } from "next-auth";

/**
 * Extends the built-in NextAuth types so that `session.user` and the JWT
 * both carry the `id` and `role` fields throughout the app — on the server
 * (via `auth()`) and on the client (via `useSession()`).
 */
declare module "next-auth" {
  interface Session {
    user: {
      id:   string;
      role: Role;
    } & DefaultSession["user"];
  }

  // Returned by the `authorize` callback and forwarded to the `jwt` callback.
  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id:   string;
    role: Role;
  }
}
