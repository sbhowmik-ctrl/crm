import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set.");
}

/**
 * Bump this when you add/change Prisma models so `next dev` does not keep an
 * old PrismaClient instance missing new delegates (e.g. `projectMember`).
 */
const PRISMA_SCHEMA_REVISION = 17;

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof buildPrismaClient> | undefined;
  /** Unwrapped client — `$extends()` can hide some model delegates on the extended proxy; base always has full API. */
  prismaBase: PrismaClient | undefined;
  prismaSchemaRevision: number | undefined;
};

// Turbopack HMR can keep a stale Prisma client missing new model delegates.
// In development, prefer correctness over reusing a singleton.
if (process.env.NODE_ENV === "development") {
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaBase = undefined;
  globalForPrisma.prismaSchemaRevision = undefined;
}

function isDateLike(value: unknown): boolean {
  return (
    value instanceof Date ||
    Object.prototype.toString.call(value) === "[object Date]"
  );
}

/** Only JSON-style objects; avoids treating Date / Decimal / Buffer as `{}`. */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively walks a `data` object and trims every string value in-place.
 * Handles nested objects (e.g. nested `create` / `update` / `connectOrCreate`)
 * so relations are covered too.
 */
function trimStrings(data: unknown): unknown {
  if (typeof data === "string") return data.trim();

  if (data === null || typeof data !== "object") return data;

  if (isDateLike(data)) return data;

  if (Array.isArray(data)) return data.map(trimStrings);

  if (!isPlainObject(data)) return data;

  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([key, value]) => [
      key,
      trimStrings(value),
    ])
  );
}

function buildPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

  const base = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

  return base.$extends({
    query: {
      $allModels: {
        async create({ args, query }) {
          if (args.data) args.data = trimStrings(args.data) as typeof args.data;
          return query(args);
        },
        async createMany({ args, query }) {
          if (args.data) args.data = trimStrings(args.data) as typeof args.data;
          return query(args);
        },
        async createManyAndReturn({ args, query }) {
          if (args.data) args.data = trimStrings(args.data) as typeof args.data;
          return query(args);
        },
        async update({ args, query }) {
          if (args.data) args.data = trimStrings(args.data) as typeof args.data;
          return query(args);
        },
        async updateMany({ args, query }) {
          if (args.data) args.data = trimStrings(args.data) as typeof args.data;
          return query(args);
        },
        async updateManyAndReturn({ args, query }) {
          if (args.data) args.data = trimStrings(args.data) as typeof args.data;
          return query(args);
        },
        async upsert({ args, query }) {
          if (args.create) args.create = trimStrings(args.create) as typeof args.create;
          if (args.update) args.update = trimStrings(args.update) as typeof args.update;
          return query(args);
        },
      },
    },
  });
}

function clientHasExpectedDelegates(client: unknown): boolean {
  const c = client as {
    activityLog?: { findMany?: unknown; deleteMany?: unknown };
    userInvitation?: { findMany?: unknown; deleteMany?: unknown };
    pendingSecretSubmission?: { findMany?: unknown };
    pendingCredentialKeySubmission?: { findMany?: unknown; create?: unknown };
    credentialSection?: { findMany?: unknown; create?: unknown };
  };
  return (
    typeof c.activityLog?.findMany === "function" &&
    typeof c.userInvitation?.findMany === "function" &&
    typeof c.userInvitation?.deleteMany === "function" &&
    typeof c.pendingSecretSubmission?.findMany === "function" &&
    typeof c.pendingCredentialKeySubmission?.findMany === "function" &&
    typeof c.pendingCredentialKeySubmission?.create === "function" &&
    typeof c.credentialSection?.findMany === "function" &&
    typeof c.credentialSection?.create === "function"
  );
}

function getClient() {
  let stale =
    globalForPrisma.prismaSchemaRevision !== PRISMA_SCHEMA_REVISION ||
    !globalForPrisma.prisma;

  // Revision matched but singleton was built before `prisma generate` (e.g. new model) — drop cache.
  if (!stale && globalForPrisma.prisma && !clientHasExpectedDelegates(globalForPrisma.prisma)) {
    stale = true;
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaSchemaRevision = undefined;
  }

  if (!stale) return globalForPrisma.prisma!;

  const client = buildPrismaClient();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaSchemaRevision = PRISMA_SCHEMA_REVISION;
  return client;
}

type ExtendedPrisma = ReturnType<typeof buildPrismaClient>;

/**
 * Proxy so every access runs {@link getClient} — fixes Turbopack HMR keeping a stale
 * `export const prisma` from before `prisma generate` (missing new model delegates).
 */
export const prisma = new Proxy({} as ExtendedPrisma, {
  get(_target, prop) {
    const client = getClient();
    // Third arg must be `client`, not the Proxy — Prisma model delegates are getters
    // that expect the real PrismaClient as `this`; wrong receiver yields undefined.
    const value = Reflect.get(client, prop, client);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
