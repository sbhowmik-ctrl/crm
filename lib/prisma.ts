import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set.");
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof buildPrismaClient> | undefined;
};

/**
 * Recursively walks a `data` object and trims every string value in-place.
 * Handles nested objects (e.g. nested `create` / `update` / `connectOrCreate`)
 * so relations are covered too.
 */
function trimStrings(data: unknown): unknown {
  if (typeof data === "string") return data.trim();

  if (Array.isArray(data)) return data.map(trimStrings);

  if (data !== null && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([key, value]) => [
        key,
        trimStrings(value),
      ])
    );
  }

  return data;
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

export const prisma = globalForPrisma.prisma ?? buildPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
