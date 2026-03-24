import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  // JWT strategy is required when using the Credentials provider.
  // The Prisma adapter's Session model becomes relevant if you later add
  // an OAuth provider with the "database" strategy.
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        const email    = credentials?.email    as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) return null;

        // Return only what gets forwarded into the JWT — keep the payload lean.
        return {
          id:    user.id,
          email: user.email,
          name:  user.name ?? undefined,
          role:  user.role,
        };
      },
    }),
  ],

  callbacks: {
    /**
     * Runs when a JWT is created (sign-in) or updated (session refresh).
     * Persists the user's id and role inside the token so they survive
     * across requests without a DB round-trip.
     */
    jwt({ token, user }) {
      if (user) {
        token.id   = user.id;
        token.role = (user as { role: Role }).role;
      }
      return token;
    },

    /**
     * Runs whenever a session is read on the server or client.
     * Projects the relevant fields from the JWT into the session object.
     */
    session({ session, token }) {
      session.user.id   = token.id   as string;
      session.user.role = token.role as Role;
      return session;
    },
  },
});
