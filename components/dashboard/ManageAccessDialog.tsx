"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Role }                    from "@prisma/client";
import { Users }                   from "lucide-react";
import { toast }                   from "sonner";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  addUserToSecret,
  removeUserFromSecret,
  addUserToNote,
  removeUserFromNote,
  addUserToCredentialSection,
  removeUserFromCredentialSection,
} from "@/app/actions/sharing";
import {
  assignProjectToUser,
  removeProjectFromUser,
} from "@/app/actions/project-assignments";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AccessUser = { id: string; name: string | null; email: string | null };

type AllUser = AccessUser & { role: Role };

interface Props {
  type:          "secret" | "note" | "credential_section" | "project";
  resourceId:    string;
  resourceName:  string;
  currentAccess: AccessUser[];
  allUsers:      AllUser[];
  /** When set (e.g. `"Assign to"`), shows a labeled button instead of the icon-only trigger. */
  triggerLabel?: string;
}

type ResourceType = Props["type"];

async function addAccessCall(
  t: ResourceType,
  resourceId: string,
  userId: string,
) {
  switch (t) {
    case "secret":
      return addUserToSecret(resourceId, userId);
    case "note":
      return addUserToNote(resourceId, userId);
    case "credential_section":
      return addUserToCredentialSection(resourceId, userId);
    case "project":
      return assignProjectToUser(userId, resourceId);
  }
}

async function removeAccessCall(
  t: ResourceType,
  resourceId: string,
  userId: string,
) {
  switch (t) {
    case "secret":
      return removeUserFromSecret(resourceId, userId);
    case "note":
      return removeUserFromNote(resourceId, userId);
    case "credential_section":
      return removeUserFromCredentialSection(resourceId, userId);
    case "project":
      return removeProjectFromUser(userId, resourceId);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ManageAccessDialog({
  type,
  resourceId,
  resourceName,
  currentAccess,
  allUsers,
  triggerLabel,
}: Props) {
  const router = useRouter();
  const [open,   setOpen]   = useState(false);
  const [access, setAccess] = useState<AccessUser[]>(currentAccess);
  const [isPending, startTransition] = useTransition();

  const isProject = type === "project";

  const available = allUsers.filter((u) => !access.some((a) => a.id === u.id));
  const sharedWithRole = access.map((u) => {
    const full = allUsers.find((x) => x.id === u.id);
    return { ...u, role: full?.role as Role | undefined };
  });
  const canRemoveUserRole = sharedWithRole.some((u) => u.role === Role.USER);
  const canRemoveInternRole = sharedWithRole.some((u) => u.role === Role.INTERN);
  const canRemoveModeratorRole = sharedWithRole.some((u) => u.role === Role.MODERATOR);
  const hasRemovableUsers = sharedWithRole.length > 0;
  const removeByRoleDisabled =
    isPending ||
    (isProject
      ? !canRemoveUserRole && !canRemoveInternRole && !canRemoveModeratorRole
      : !canRemoveUserRole && !canRemoveInternRole);

  const refreshAfterMutation = () => {
    if (isProject) router.refresh();
  };

  useEffect(() => {
    setAccess(currentAccess);
  }, [currentAccess]);

  const handleAdd = (userId: string | null) => {
    if (userId == null) return;
    const user = allUsers.find((u) => u.id === userId);
    if (!user) return;

    // Optimistic
    setAccess((prev) => [...prev, user]);

    startTransition(async () => {
      const result = await addAccessCall(type, resourceId, userId);

      if (!result.success) {
        setAccess((prev) => prev.filter((u) => u.id !== userId));
        toast.error(result.error);
      } else {
        toast.success(
          isProject
            ? `Assigned ${user.name ?? user.email} to this project.`
            : `Access granted to ${user.name ?? user.email}.`,
        );
        refreshAfterMutation();
      }
    });
  };
  const handleAddByRole = (roleValue: string | null) => {
    if (!roleValue) return;
    const role = roleValue as Role;
    const toAdd = available.filter((u) => u.role === role);
    if (toAdd.length === 0) return;

    // Optimistic: add everyone in this role locally
    setAccess((prev) => [...prev, ...toAdd]);

    startTransition(async () => {
      for (const user of toAdd) {
        const result = await addAccessCall(type, resourceId, user.id);

        if (!result.success) {
          setAccess((prev) => prev.filter((u) => u.id !== user.id));
          toast.error(result.error);
        } else {
          toast.success(
            isProject
              ? `Assigned ${user.name ?? user.email} to this project.`
              : `Access granted to ${user.name ?? user.email}.`,
          );
        }
      }
      refreshAfterMutation();
    });
  };

  const handleRemove = (userId: string) => {
    const user = access.find((u) => u.id === userId);

    // Optimistic
    setAccess((prev) => prev.filter((u) => u.id !== userId));

    startTransition(async () => {
      const result = await removeAccessCall(type, resourceId, userId);

      if (!result.success) {
        if (user) setAccess((prev) => [...prev, user]);
        toast.error(result.error);
      } else {
        toast.success(isProject ? `Removed from this project.` : `Access removed.`);
        refreshAfterMutation();
      }
    });
  };

  const handleRemoveByUser = (userId: string | null) => {
    if (!userId) return;
    handleRemove(userId);
  };

  const handleRemoveByRole = (roleValue: string | null) => {
    if (!roleValue) return;
    const role = roleValue as Role;
    const toRemove = sharedWithRole.filter((u) => u.role === role);
    if (toRemove.length === 0) return;

    // Optimistic: remove all matching users locally
    const ids = toRemove.map((u) => u.id);
    setAccess((prev) => prev.filter((u) => !ids.includes(u.id)));

    startTransition(async () => {
      for (const user of toRemove) {
        const result = await removeAccessCall(type, resourceId, user.id);

        if (!result.success) {
          // Put back this user on failure
          setAccess((prev) => [...prev, { id: user.id, name: user.name, email: user.email }]);
          toast.error(result.error);
        } else {
          toast.success(
            isProject
              ? `Removed ${user.name ?? user.email} from this project.`
              : `Access removed for ${user.name ?? user.email}.`,
          );
        }
      }
      refreshAfterMutation();
    });
  };

  const listHeading = isProject ? "Assigned to" : "Shared with";
  const emptyListHint = isProject
    ? "No users assigned to this project yet."
    : "No individual users added yet.";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          triggerLabel ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              aria-label={triggerLabel}
            >
              <Users className="h-4 w-4" />
              {triggerLabel}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label="Manage access"
              title="Manage access"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                <circle cx="6" cy="5"  r="2.5" stroke="currentColor" strokeWidth="1.25" />
                <path d="M1 13c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                <path d="M11.5 8v4M9.5 10h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
            </Button>
          )
        }
      />

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="truncate">
            {isProject ? "Project assignments" : "Access"} — {resourceName}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {/* Current access list */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {listHeading} ({access.length})
            </p>
            {access.length === 0 ? (
              <p className="text-sm text-muted-foreground">{emptyListHint}</p>
            ) : (
              <ul className="space-y-1.5">
                {access.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.name ?? "Unnamed"}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(u.id)}
                      disabled={isPending}
                    >
                      <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                        <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add Permission */}
          {available.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Add permission
              </p>
              {/* By role */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Select by role
                </span>
                <Select onValueChange={handleAddByRole} disabled={isPending}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a role…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={Role.INTERN}>Intern</SelectItem>
                    <SelectItem value={Role.USER}>User</SelectItem>
                    {isProject && (
                      <SelectItem value={Role.MODERATOR}>Moderator</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* By user */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Select by user
                </span>
                <Select onValueChange={handleAdd} disabled={isPending}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Search or choose a user…" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        <span className="flex items-center gap-2">
                          <span className="truncate max-w-[180px]">
                            {u.name ?? u.email}
                          </span>
                          <Badge variant="outline" className="text-[10px] py-0">
                            {u.role}
                          </Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <p className="pt-1 text-[11px] text-muted-foreground">
                {isProject
                  ? "Admins and Superadmins have full vault access without project assignment."
                  : "Moderators and above already have access by role."}
              </p>
            </div>
          )}

          {/* Remove Permission */}
          <div className="space-y-3 pt-2 border-t border-border/50">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Remove permission
            </p>

            {/* By role */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Remove by role
              </span>
              <Select
                onValueChange={handleRemoveByRole}
                disabled={removeByRoleDisabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={hasRemovableUsers ? "Choose a role…" : "No roles to remove"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Role.INTERN} disabled={!canRemoveInternRole}>
                    Intern
                  </SelectItem>
                  <SelectItem value={Role.USER} disabled={!canRemoveUserRole}>
                    User
                  </SelectItem>
                  {isProject && (
                    <SelectItem value={Role.MODERATOR} disabled={!canRemoveModeratorRole}>
                      Moderator
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* By user */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Remove by user
              </span>
              <Select
                onValueChange={handleRemoveByUser}
                disabled={isPending || !hasRemovableUsers}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={hasRemovableUsers ? "Choose a user to remove…" : "No users to remove"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {sharedWithRole.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="flex items-center gap-2">
                        <span className="truncate max-w-[180px]">
                          {u.name ?? u.email}
                        </span>
                        {u.role && (
                          <Badge variant="outline" className="text-[10px] py-0">
                            {u.role}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
