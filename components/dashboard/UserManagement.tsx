"use client";

import { useState, useTransition } from "react";
import { useRouter }               from "next/navigation";
import { Role }                    from "@prisma/client";
import { toast }                   from "sonner";
import { Badge }  from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { updateUserRole, deactivateUser, reactivateUser } from "@/app/actions/users";
import UserProjectAssignmentsCell from "@/components/dashboard/UserProjectAssignmentsCell";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserRow {
  id:        string;
  name:      string | null;
  email:     string | null;
  role:      Role;
  isActive:  boolean;
  createdAt: string;
  assignedProjects: {
    id:       string;
    name:     string;
    parentId: string | null;
    parent:   { id: string; name: string } | null;
  }[];
}

interface Props {
  users:           UserRow[];
  currentUserId:   string;
  currentUserRole: Role;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_RANK: Record<Role, number> = {
  INTERN: 0, USER: 1, MODERATOR: 2, ADMIN: 3, SUPERADMIN: 4,
};

const ROLE_BADGE: Record<Role, "default" | "secondary" | "outline" | "destructive"> = {
  SUPERADMIN: "destructive",
  ADMIN:      "default",
  MODERATOR:  "secondary",
  USER:       "outline",
  INTERN:     "outline",
};

const ALL_ROLES: Role[] = [Role.INTERN, Role.USER, Role.MODERATOR, Role.ADMIN, Role.SUPERADMIN];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function UserTableRow({
  user,
  currentUserId,
  currentUserRole,
}: {
  user:            UserRow;
  currentUserId:   string;
  currentUserRole: Role;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isSelf         = user.id === currentUserId;
  const actorRank      = ROLE_RANK[currentUserRole];
  const targetRank     = ROLE_RANK[user.role];
  const canModify      = !isSelf && actorRank > targetRank;
  /** Only ADMIN / SUPERADMIN may change activation status (not Moderator and below). */
  const canToggleStatus =
    !isSelf &&
    (currentUserRole === Role.ADMIN || currentUserRole === Role.SUPERADMIN) &&
    (currentUserRole === Role.SUPERADMIN || actorRank > targetRank);

  const canManageProjectAssignments =
    !isSelf &&
    (currentUserRole === Role.ADMIN || currentUserRole === Role.SUPERADMIN) &&
    (currentUserRole === Role.SUPERADMIN || actorRank > targetRank);

  // Roles the current actor can assign to this user
  const assignableRoles = ALL_ROLES.filter((r) => {
    if (currentUserRole === Role.SUPERADMIN) return r !== user.role; // SUPERADMIN can assign any role
    return ROLE_RANK[r] < actorRank && r !== user.role;
  });

  const handleRoleChange = (newRole: Role) => {
    if (!newRole || newRole === user.role) return;

    startTransition(async () => {
      const result = await updateUserRole(user.id, newRole);
      if (result.success) {
        toast.success(`Role updated to ${newRole}.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDeactivate = () => {
    startTransition(async () => {
      const result = await deactivateUser(user.id);
      if (result.success) {
        toast.success(`"${user.name ?? user.email}" has been deactivated.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleReactivate = () => {
    startTransition(async () => {
      const result = await reactivateUser(user.id);
      if (result.success) {
        toast.success(`"${user.name ?? user.email}" has been reactivated.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <TableRow className={`border-b border-white/5 transition-colors hover:bg-white/5 ${!user.isActive ? "opacity-50 grayscale-[0.5]" : isSelf ? "bg-blue-500/5 hover:bg-blue-500/10" : "hover:bg-white/10"}`}>
      <TableCell className="px-8 py-5">
        <div className="flex flex-col">
          <p className="text-sm font-black text-[#0c1421] uppercase tracking-wide">{user.name ?? <span className="italic text-slate-400">Anonymous</span>}</p>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5 tracking-tight">{user.email}</p>
        </div>
      </TableCell>

      <TableCell className="px-8 py-5">
        <div className={`inline-flex px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${ROLE_BADGE_CLASS[user.role]}`}>
          {user.role}
        </div>
      </TableCell>

      <TableCell className="px-8 py-5">
        {canToggleStatus && user.isActive ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <button
                  type="button"
                  disabled={isPending}
                  className="group flex items-center gap-2 px-2.5 py-0.5 bg-green-500/10 text-green-600 border border-green-500/20 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-green-500/20 transition-all"
                >
                  <div className="size-1.5 bg-green-500 rounded-full animate-pulse" />
                  Active
                </button>
              }
            />
            <AlertDialogContent className="max-w-sm bg-white border-0 rounded-[2rem] overflow-hidden shadow-2xl p-0">
              <div className="p-10 flex flex-col items-center text-center space-y-6">
                <div className="size-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
                  <AlertTriangle className="size-8 fill-red-600/10" strokeWidth={2.5} />
                </div>
                
                <div className="space-y-4">
                  <AlertDialogTitle className="text-xl font-black text-[#0c1421] uppercase tracking-wide">
                    Identity Suspension
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-500 font-medium text-[13px] leading-relaxed px-2">
                    Revoke all vault permissions for <span className="text-[#0c1421] font-bold uppercase">{user.role}</span>? This will immediately freeze their workspace access.
                  </AlertDialogDescription>
                </div>

                <div className="w-full space-y-3 pt-4">
                  <AlertDialogAction
                    onClick={handleDeactivate}
                    className="w-full h-14 bg-[#bd1e1e] hover:bg-[#a31a1a] text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-red-500/20 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                  >
                    <Ban className="size-4" />
                    Suspend
                  </AlertDialogAction>
                  
                  <AlertDialogCancel className="w-full h-14 bg-slate-100 hover:bg-slate-200 border-0 text-[#0c1421] rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-[0.98] transition-all">
                    Cancel
                  </AlertDialogCancel>
                </div>
              </div>

              <div className="bg-slate-50 py-3.5 border-t border-slate-100 flex items-center justify-center gap-2">
                <Lock className="size-3 text-slate-400" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Audit log will be recorded</span>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <div className={`inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${
            user.isActive 
              ? "bg-green-500/10 text-green-600 border-green-500/20" 
              : "bg-slate-100 text-slate-400 border-slate-200"
          }`}>
            {user.isActive && <div className="size-1.5 bg-green-500 rounded-full" />}
            {user.isActive ? "Active" : "Inactive"}
          </div>
        )}
      </TableCell>

      <TableCell className="px-8 py-5 text-[10px] font-black text-slate-400 tracking-widest uppercase">
        {formatDate(user.createdAt)}
      </TableCell>

      <TableCell className="px-8 py-5">
        <UserProjectAssignmentsCell
          targetUser={{ id: user.id, name: user.name, email: user.email }}
          assignedProjects={user.assignedProjects}
          canManage={canManageProjectAssignments}
        />
      </TableCell>

      <TableCell className="px-8 py-5 text-right">
        {isSelf ? (
          <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest opacity-60">System User</span>
        ) : (
          <div className="flex items-center justify-end gap-3">
            {canModify && user.isActive && assignableRoles.length > 0 && (
              <Select
                value={user.role}
                onValueChange={(v) => {
                  if (!v) return;
                  handleRoleChange(v as Role);
                }}
                disabled={isPending}
              >
                <SelectTrigger className="h-8 w-32 bg-white/40 border-white/20 backdrop-blur-md rounded-lg text-[10px] font-black uppercase tracking-widest text-[#0c1421] focus:ring-blue-500/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" sideOffset={8} className="bg-white/90 backdrop-blur-xl border-white/20 rounded-xl">
                  <SelectItem value={user.role} disabled className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {user.role} (Current)
                  </SelectItem>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r} value={r} className="text-[10px] font-black uppercase tracking-widest text-[#0c1421]">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {canToggleStatus && !user.isActive && (
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-4 rounded-lg border-blue-500/20 bg-blue-500/5 text-[10px] font-black text-blue-500 uppercase tracking-widest hover:bg-blue-500/10 transition-all"
                      disabled={isPending}
                    >
                      Authorize Restore
                    </Button>
                  }
                />
                <AlertDialogContent className="max-w-sm bg-white border-0 rounded-[2rem] overflow-hidden shadow-2xl p-0">
                  <div className="p-10 flex flex-col items-center text-center space-y-6">
                    <div className="size-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                      <UserPlus className="size-8" strokeWidth={2.5} />
                    </div>
                    
                    <div className="space-y-4">
                      <AlertDialogTitle className="text-xl font-black text-[#0c1421] uppercase tracking-wide">
                        Restore Identity
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-500 font-medium text-[13px] leading-relaxed px-2">
                        Reactivate <span className="text-[#0c1421] font-bold">{user.name ?? user.email}</span> and restore their access to the vault workspace?
                      </AlertDialogDescription>
                    </div>

                    <div className="w-full space-y-3 pt-4">
                      <AlertDialogAction
                        onClick={handleReactivate}
                        className="w-full h-14 bg-[#0c1421] hover:bg-black text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-blue-500/10 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                      >
                        Restore
                      </AlertDialogAction>
                      
                      <AlertDialogCancel className="w-full h-14 bg-slate-100 hover:bg-slate-200 border-0 text-[#0c1421] rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-[0.98] transition-all">
                        Cancel
                      </AlertDialogCancel>
                    </div>
                  </div>

                  <div className="bg-slate-50 py-3.5 border-t border-slate-100 flex items-center justify-center gap-2">
                    <ShieldCheck className="size-3.5 text-slate-400" />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Audit log will be recorded</span>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function UserManagement({ users, currentUserId, currentUserRole }: Props) {
  const [search, setSearch] = useState("");

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="relative w-full max-w-md group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Users by name, email, or role..."
            className="w-full h-12 bg-white/40 border border-white/40 backdrop-blur-md rounded-xl pl-11 pr-4 text-sm font-medium text-[#0c1421] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm transition-all"
          />
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{users.filter((u) => u.isActive).length} ACTIVE</span>
            <span className="text-slate-200">/</span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{users.length} TOTAL</span>
          </div>
        </div>
      </div>

      <div className="max-h-[min(80vh,48rem)] overflow-auto rounded-[2rem] border border-white/40 bg-white/30 shadow-2xl backdrop-blur-md">
        <div className="min-w-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/10 hover:bg-transparent">
                <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</TableHead>
                <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</TableHead>
                <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</TableHead>
                <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Joined</TableHead>
                <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Projects</TableHead>
                <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500 py-24 font-bold uppercase tracking-widest text-xs">
                    No matching records in the identity directory.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((u) => (
                  <UserTableRow
                    key={u.id}
                    user={u}
                    currentUserId={currentUserId}
                    currentUserRole={currentUserRole}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] text-center">
        User Management  - Credential Vault 
      </p>
    </div>
  );
}
import { Search, AlertTriangle, Ban, Lock, UserPlus, ShieldCheck } from "lucide-react";

const ROLE_BADGE_CLASS: Record<Role, string> = {
  SUPERADMIN: "bg-red-500/10 text-red-600 border-red-500/20",
  ADMIN:      "bg-blue-500/10 text-blue-600 border-blue-500/20",
  MODERATOR:  "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  USER:       "bg-slate-500/10 text-slate-600 border-slate-500/20",
  INTERN:     "bg-slate-100 text-slate-500 border-slate-200",
};
