import { EventEmitter } from "events";

// Use a global variable to preserve the emitter across HMR reloads in development
const globalForEvents = globalThis as unknown as {
  eventBus: EventEmitter | undefined;
};

export const eventBus = globalForEvents.eventBus ?? new EventEmitter();

if (process.env.NODE_ENV !== "production") {
  globalForEvents.eventBus = eventBus;
}

// Optional: Define strict event types
export type AppEvent = {
  type: "ACCESS_REVOKED" | "SECRET_DELETED" | "PROJECT_ARCHIVED" | "PROJECT_CREATED";
  userId?: string;     // If the event is specific to a user
  projectId?: string;  // If the event is specific to a project
  message?: string;
};