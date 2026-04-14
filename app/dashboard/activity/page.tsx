import Link from "next/link";
import { redirect } from "next/navigation";
import { ActivityAction, Role } from "@prisma/client";
import { auth } from "@/auth";
import { getActivityLogsPage } from "@/lib/queries/activity";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { 
  Plus, 
  RefreshCcw, 
  Trash2, 
  Archive, 
  UserPlus, 
  UserMinus, 
  LogOut, 
  Settings2,
  Clock,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
const ELEVATED = new Set<Role>([Role.SUPERADMIN, Role.ADMIN, Role.MODERATOR]);

/** Activity log timestamps are shown in IST for operators in India. */
const ACTIVITY_TIMEZONE = "Asia/Kolkata";

function formatActivityTimeIST(iso: Date): string {
  return iso.toLocaleTimeString("en-IN", {
    timeZone: ACTIVITY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatActivityDateIST(iso: Date): string {
  return iso.toLocaleDateString("en-IN", {
    timeZone: ACTIVITY_TIMEZONE,
    month: "short",
    day: "numeric",
  });
}

function ActionIcon({ action }: { action: ActivityAction }) {
  const base = "size-5";
  switch (action) {
    case ActivityAction.CREATE: return <Plus className={`${base} text-green-400`} />;
    case ActivityAction.UPDATE: return <RefreshCcw className={`${base} text-blue-400`} />;
    case ActivityAction.DELETE: return <Trash2 className={`${base} text-red-400`} />;
    case ActivityAction.ARCHIVE: return <Archive className={`${base} text-amber-400`} />;
    case ActivityAction.ASSIGN: return <UserPlus className={`${base} text-indigo-400`} />;
    case ActivityAction.REMOVE: return <UserMinus className={`${base} text-orange-400`} />;
    case ActivityAction.LEAVE: return <LogOut className={`${base} text-rose-400`} />;
    case ActivityAction.STATUS: return <Settings2 className={`${base} text-slate-400`} />;
    default: return <Clock className={base} />;
  }
}

function entityKindNoun(entityType: string): string {
  switch (entityType) {
    case "project": return "Project";
    case "note": return "Note";
    case "secret": return "Secret";
    case "user": return "User Entity";
    case "project_member": return "Project Assignment";
    case "sharing_secret": return "Secret Access";
    case "sharing_note": return "Note Access";
    default: return entityType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  }
}

function verbPhrase(action: ActivityAction, entityType: string): string {
  if (action === ActivityAction.STATUS && entityType === "user") {
    return "reconfigured status for";
  }
  switch (action) {
    case ActivityAction.CREATE: return "initialized";
    case ActivityAction.UPDATE: return "modified";
    case ActivityAction.DELETE: return "purged";
    case ActivityAction.ARCHIVE: return "vaulted";
    case ActivityAction.ASSIGN: return "delegated";
    case ActivityAction.REMOVE: return "revoked";
    case ActivityAction.LEAVE: return "disconnected from";
    case ActivityAction.STATUS: return "updated state of";
    default: return "processed";
  }
}

function parseActivityPageParam(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 1;
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/** Invitation logs store invitee email on `entityId`; older rows may only have it in `label`. */
function invitationInviteeEmail(
  entityType: string,
  entityId: string | null,
  label: string | null | undefined,
): string | null {
  if (entityType !== "invitation") return null;
  if (entityId?.includes("@")) return entityId;
  const fromLabel = label?.match(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i)?.[0];
  return fromLabel ?? null;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  if (!ELEVATED.has(session.user.role)) {
    redirect("/dashboard/projects");
  }

  const sp = await searchParams;
  const requestedPage = parseActivityPageParam(sp.page);
  const { rows, total, page, pageSize, totalPages } =
    await getActivityLogsPage(requestedPage);

  if (total > 0 && requestedPage !== page) {
    redirect(`/dashboard/activity?page=${page}`);
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="space-y-10 pb-20 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pointer-events-none sticky top-0 z-20 pt-4 bg-transparent">
        <div className="space-y-1 pointer-events-auto">
          <h1 className="text-3xl font-black tracking-tight text-[#0c1421] drop-shadow-sm uppercase">system activity</h1>
          <p className="text-base text-slate-500 font-medium tracking-tight">
            Real-time update of all vault operations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-end pointer-events-auto">
          {total > 0 && (
            <div className="px-3 py-1.5 bg-white/40 backdrop-blur-md rounded-full border border-white/40 shadow-sm">
              <span className="text-[9px] font-black tracking-widest text-[#0c1421] uppercase tabular-nums">
                Page {page} / {totalPages}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/40 backdrop-blur-md rounded-full border border-white/40 shadow-sm">
            <div className="size-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            <span className="text-[9px] font-black tracking-widest text-[#0c1421] uppercase">Monitoring Active</span>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white/30 backdrop-blur-md rounded-2xl border border-white/40 p-16 text-center space-y-4">
          <div className="size-12 bg-slate-100 rounded-xl mx-auto flex items-center justify-center text-slate-400">
            <Archive className="size-6" />
          </div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">No activity records found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {rows.map((row) => {
            const kind = entityKindNoun(row.entityType);
            const verb = verbPhrase(row.action, row.entityType);
            const label = row.label?.trim();
            const showLabel = Boolean(label);
            const inviteeEmail = invitationInviteeEmail(
              row.entityType,
              row.entityId,
              row.label,
            );

            return (
              <div 
                key={row.id} 
                className="group relative flex flex-col md:flex-row md:items-center gap-5 overflow-hidden bg-white/40 backdrop-blur-md border border-white/40 p-5 rounded-2xl shadow-sm transition-all hover:bg-white/60 hover:shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-500"
              >
                <div className="flex shrink-0 items-center justify-center size-12 rounded-xl bg-[#0c1421] text-white shadow-lg relative overflow-hidden group-hover:scale-110 transition-transform">
                  <ActionIcon action={row.action} />
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                <div className="flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-xs font-black text-[#0c1421] uppercase tracking-wide">
                      {row.actor.name ?? row.actor.email}
                    </span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-[9px] font-bold text-slate-500 rounded uppercase tracking-wider">
                      {row.actor.role}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">{verb}</span>
                    <span className="text-[11px] font-bold text-[#0c1421] uppercase tracking-tighter">{kind}</span>
                    {inviteeEmail ? (
                      <>
                        <span className="text-[11px] font-medium text-slate-400">to</span>
                        <span
                          className="text-[11px] font-bold text-[#0c1421] tracking-tight break-all max-w-[min(100%,18rem)] sm:max-w-none"
                          title={inviteeEmail}
                        >
                          {inviteeEmail}
                        </span>
                      </>
                    ) : null}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {showLabel ? (
                      <span className="text-sm font-bold text-[#0c1421] bg-white/60 px-3 py-0.5 rounded-lg border border-white/20 max-w-[min(100%,28rem)] break-words">
                        {label}
                      </span>
                    ) : (
                      <code className="text-[10px] text-blue-500 font-mono bg-blue-500/5 px-2 py-0.5 rounded-md border border-blue-500/10 uppercase tracking-tighter">
                        {row.entityId?.slice(0, 8)}...
                      </code>
                    )}
                    <ChevronRight className="size-3.5 text-slate-300 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>

                <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-1 shrink-0 md:pl-5 md:border-l border-white/20">
                  <time className="text-[10px] font-black text-[#0c1421] tabular-nums uppercase tracking-widest leading-none">
                    {formatActivityTimeIST(row.createdAt)}
                  </time>
                  <time className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">
                    {formatActivityDateIST(row.createdAt)}
                  </time>
                </div>

                {/* Status Glow */}
                <div className={`absolute top-0 bottom-0 right-0 w-1 rounded-r-full transition-opacity opacity-0 group-hover:opacity-100 ${
                   row.action === ActivityAction.DELETE ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                   row.action === ActivityAction.CREATE ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" :
                   "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                }`} />
              </div>
            );
          })}
        </div>
      )}

      {total > 0 && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 rounded-2xl border border-white/40 bg-white/30 backdrop-blur-md px-4 py-4 sm:px-6">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center sm:text-left tabular-nums">
            Showing {rangeStart}–{rangeEnd} of {total}
          </p>
          <div className="flex items-center justify-center gap-2">
            {page <= 1 ? (
              <Button type="button" variant="outline" size="sm" disabled className="font-black uppercase tracking-widest text-[9px] gap-1">
                <ChevronLeft className="size-3.5" />
                Previous
              </Button>
            ) : (
              <Link
                href={`/dashboard/activity?page=${page - 1}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "font-black uppercase tracking-widest text-[9px] gap-1 inline-flex",
                )}
              >
                <ChevronLeft className="size-3.5" />
                Previous
              </Link>
            )}
            {page >= totalPages ? (
              <Button type="button" variant="outline" size="sm" disabled className="font-black uppercase tracking-widest text-[9px] gap-1">
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            ) : (
              <Link
                href={`/dashboard/activity?page=${page + 1}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "font-black uppercase tracking-widest text-[9px] gap-1 inline-flex",
                )}
              >
                Next
                <ChevronRight className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      )}

      <footer className="pt-12 text-center">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
          end of activity • <Link href="/dashboard" className="text-blue-500 hover:text-blue-600 transition-colors">access dashboard</Link>
        </p>
      </footer>
    </div>
  );
}
