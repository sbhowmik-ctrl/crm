/**
 * auth.ts — Full NextAuth configuration (Node.js runtime only).
 *
 * Imports authConfig from auth.config.ts and layers on the Node.js-specific
 * pieces: Google OAuth provider and Prisma adapter (needs pg).
 *
 * Never import this file from middleware.ts.
 */
import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Role } from "@prisma/client";

import { pictureForJwt } from "@/lib/picture-for-jwt";
import { prisma }     from "@/lib/prisma";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  adapter: PrismaAdapter(prisma) as Adapter,

  callbacks: {
    // Keep `authorized` and `session` from authConfig; override `jwt` so that
    // role changes made outside the app (e.g. Prisma Studio) are reflected on
    // the very next request without requiring a sign-out / sign-in cycle.
    ...authConfig.callbacks,

    async jwt({ token, user }) {
      if (user) {
        // Initial sign-in — seed token from the newly created or fetched DB user.
        // We use fallbacks ("USER" and true) just in case the OAuth payload is 
        // evaluated before the DB defaults populate.
        token.id       = user.id;
        token.role     = (user as { id: string; role?: Role }).role ?? "USER";
        token.isActive = (user as { id: string; isActive?: boolean }).isActive ?? true;
        token.picture = pictureForJwt(
          (user as { image?: string | null }).image ?? undefined,
        );
      } else if (token.id) {
        // Every subsequent request — re-fetch role and isActive from DB so that
        // deactivation takes effect on the very next request without sign-out.
        const dbUser = await prisma.user.findUnique({
          where:  { id: token.id as string },
          select: { role: true, isActive: true, image: true, name: true },
        });
        if (dbUser) {
          token.role     = dbUser.role;
          token.isActive = dbUser.isActive;
          token.picture = pictureForJwt(dbUser.image);
          token.name     = dbUser.name ?? undefined;
        }
      }
      return token;
    },
  },

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
});