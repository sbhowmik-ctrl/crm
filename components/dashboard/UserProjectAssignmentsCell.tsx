"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Trash2, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  assignProjectsToUserBatch,
  listUnassignedRootProjectsPage,
  listUnassignedSubprojectsPage,
  removeProjectFromUser,
} from "@/app/actions/project-assignments";

type AssignedProject = {
  id:       string;
  name:     string;
  parentId: string | null;
  parent:   { id: string; name: string } | null;
};

interface Props {
  targetUser: {
    id:    string;
    name:  string | null;
    email: string | null;
  };
  assignedProjects: AssignedProject[];
  canManage: boolean;
}

function formatAssignedLabel(p: AssignedProject) {
  if (p.parent) return `${p.parent.name} → ${p.name}`;
  return p.name;
}

type RootRow = { id: string; name: string; childCount: number };

type SubState = {
  items:   { id: string; name: string }[];
  page:    number;
  hasMore: boolean;
  loading: boolean;
};

export default function UserProjectAssignmentsCell({
  targetUser,
  assignedProjects,
  canManage,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [addMoreOpen, setAddMoreOpen] = useState(false);

  const [rootRows, setRootRows] = useState<RootRow[]>([]);
  const [rootPage, setRootPage] = useState(0);
  const [rootHasMore, setRootHasMore] = useState(false);
  const [loadingRoots, setLoadingRoots] = useState(false);

  const [expandedRootId, setExpandedRootId] = useState<string | null>(null);
  const [subByParent, setSubByParent] = useState<Record<string, SubState>>({});

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [nameById, setNameById] = useState<Map<string, string>>(new Map());

  /** Snapshot when opening the confirm dialog — the popover closes and clears `selectedIds` while the alert stays open. */
  const [pendingBatch, setPendingBatch] = useState<{
    ids: string[];
    nameById: Map<string, string>;
  } | null>(null);

  const [batchOpen, setBatchOpen] = useState(false);

  const [removeOpen, setRemoveOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);

  const displayName = targetUser.name ?? targetUser.email ?? "this user";

  const resetAddMore = useCallback(() => {
    setAddMoreOpen(false);
    setRootRows([]);
    setRootPage(0);
    setRootHasMore(false);
    setLoadingRoots(false);
    setExpandedRootId(null);
    setSubByParent({});
    setSelectedIds(new Set());
    setNameById(new Map());
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetAddMore();
  };

  const toggleId = (id: string, name: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setNameById((prev) => {
      const next = new Map(prev);
      if (checked) next.set(id, name);
      else next.delete(id);
      return next;
    });
  };

  const loadRootPage = async (nextPage: number, append: boolean) => {
    setLoadingRoots(true);
    try {
      const res = await listUnassignedRootProjectsPage(targetUser.id, nextPage);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setRootHasMore(res.hasMore);
      setRootPage(nextPage);
      setRootRows((prev) => (append ? [...prev, ...res.items] : res.items));
    } finally {
      setLoadingRoots(false);
    }
  };

  const loadSubPage = async (parentId: string, nextPage: number, append: boolean) => {
    setSubByParent((prev) => ({
      ...prev,
      [parentId]: {
        items:   prev[parentId]?.items ?? [],
        page:    prev[parentId]?.page ?? 0,
        hasMore: prev[parentId]?.hasMore ?? false,
        loading: true,
      },
    }));
    const res = await listUnassignedSubprojectsPage(targetUser.id, parentId, nextPage);
    if (!res.success) {
      toast.error(res.error);
      setSubByParent((prev) => ({
        ...prev,
        [parentId]: { ...prev[parentId]!, loading: false },
      }));
      return;
    }
    setSubByParent((prev) => {
      const prior = prev[parentId]?.items ?? [];
      const items = append ? [...prior, ...res.items] : res.items;
      return {
        ...prev,
        [parentId]: {
          items,
          page:    nextPage,
          hasMore: res.hasMore,
          loading: false,
        },
      };
    });
  };

  const handleToggleAddMore = () => {
    if (!addMoreOpen) {
      setAddMoreOpen(true);
      void loadRootPage(0, false);
    } else {
      resetAddMore();
    }
  };

  const handleExpandRoot = (root: RootRow) => {
    if (expandedRootId === root.id) {
      setExpandedRootId(null);
      return;
    }
    setExpandedRootId(root.id);
    if (root.childCount === 0) return;
    void loadSubPage(root.id, 0, false);
  };

  const selectAllLoadedSubs = (rootId: string, checked: boolean) => {
    const items = subByParent[rootId]?.items ?? [];
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const it of items) {
        if (checked) next.add(it.id);
        else next.delete(it.id);
      }
      return next;
    });
    setNameById((prev) => {
      const next = new Map(prev);
      for (const it of items) {
        if (checked) next.set(it.id, it.name);
        else next.delete(it.id);
      }
      return next;
    });
  };

  const confirmBatchAssign = () => {
    const batch = pendingBatch;
    if (!batch || batch.ids.length === 0) return;
    const ids = batch.ids;
    const names = batch.nameById;
    startTransition(async () => {
      const result = await assignProjectsToUserBatch(targetUser.id, ids);
      if (result.success) {
        toast.success(
          ids.length === 1
            ? `Assigned “${names.get(ids[0])}” to ${displayName}.`
            : `Assigned ${ids.length} projects to ${displayName}.`,
        );
        setPendingBatch(null);
        setBatchOpen(false);
        setOpen(false);
        resetAddMore();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const openBatchConfirm = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setPendingBatch({ ids, nameById: new Map(nameById) });
    setBatchOpen(true);
  };

  const confirmRemove = () => {
    if (!pendingRemove) return;
    const p = pendingRemove;
    startTransition(async () => {
      const result = await removeProjectFromUser(targetUser.id, p.id);
      if (result.success) {
        toast.success(`Removed ${displayName} from “${p.name}”.`);
        setRemoveOpen(false);
        setPendingRemove(null);
        resetAddMore();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  if (!canManage) {
    const n = assignedProjects.length;
    return (
      <span className="text-xs text-muted-foreground">
        {n === 0 ? "—" : `${n} project${n === 1 ? "" : "s"}`}
      </span>
    );
  }

  const selectionCount = selectedIds.size;
  const batchCount = pendingBatch?.ids.length ?? 0;
  const batchPreview =
    pendingBatch?.ids.map((id) => pendingBatch.nameById.get(id) ?? id).slice(0, 8) ?? [];

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          disabled={isPending}
          className="inline-flex h-8 min-w-[6.5rem] items-center justify-between gap-2 rounded-lg border border-white/20 bg-white/40 backdrop-blur-md px-3 text-[10px] font-black uppercase tracking-widest text-[#0c1421] shadow-sm transition-all hover:bg-white/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:opacity-50"
        >
          <span className="truncate">
            {assignedProjects.length === 0
              ? "Projects"
              : `${assignedProjects.length} ${assignedProjects.length === 1 ? "Project" : "Projects"}`}
          </span>
          <ChevronDown className={`size-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          className="w-[24rem] max-w-[min(100vw-2rem,24rem)] max-h-[28rem] overflow-y-auto p-0 bg-white/60 backdrop-blur-2xl border-white/40 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-300"
        >
          <div className="bg-[#0c1421]/5 border-b border-white/20 px-4 py-3 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0c1421]">Assigned Projects</p>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              Subprojects appear under their parent hierarchy. Membership removal only affects access protocols.
            </p>
          </div>

          <div className="px-2 py-2">
            {assignedProjects.length === 0 ? (
              <div className="px-3 py-6 text-center space-y-2">
                <div className="size-8 bg-slate-100 rounded-lg mx-auto flex items-center justify-center text-slate-400">
                  <ShieldCheck className="size-4" />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No active assignments</p>
              </div>
            ) : (
              <ul className="grid gap-1">
                {assignedProjects.map((p) => (
                  <li
                    key={p.id}
                    className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-[13px] transition-all hover:bg-white/60 border border-transparent hover:border-white/40"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-1.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                      <span className="truncate font-bold text-[#0c1421]" title={formatAssignedLabel(p)}>
                        {formatAssignedLabel(p)}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      disabled={isPending}
                      onClick={() => {
                        setPendingRemove({ id: p.id, name: formatAssignedLabel(p) });
                        setRemoveOpen(true);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-2 bg-white/40 border-t border-white/20">
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full justify-between px-3 rounded-xl hover:bg-white/60 text-[10px] font-black uppercase tracking-widest text-[#0c1421] transition-all"
              onClick={handleToggleAddMore}
              disabled={isPending || loadingRoots}
            >
              <div className="flex items-center gap-2">
                <Plus className="size-3.5" />
                <span>ADD PROJECTS</span>
              </div>
              <ChevronDown
                className={`size-3.5 opacity-60 transition-transform duration-300 ${addMoreOpen ? "rotate-180" : ""}`}
              />
            </Button>

            {addMoreOpen && (
              <div className="mt-2 px-1 pb-2 space-y-3 animate-in slide-in-from-top-2 duration-300">
                {rootRows.length === 0 && !loadingRoots ? (
                  <p className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">No directories found</p>
                ) : (
                  <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {rootRows.map((root) => {
                      const expanded = expandedRootId === root.id;
                      const sub = subByParent[root.id];
                      return (
                        <li key={root.id} className="rounded-xl border border-white/20 bg-white/20 overflow-hidden">
                          <div className="flex items-center gap-1 p-1">
                            {root.childCount > 0 ? (
                              <button
                                type="button"
                                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/40 transition-colors"
                                onClick={() => handleExpandRoot(root)}
                                aria-expanded={expanded}
                              >
                                {expanded ? (
                                  <ChevronDown className="size-3.5 text-[#0c1421]" />
                                ) : (
                                  <ChevronRight className="size-3.5 text-[#0c1421]" />
                                )}
                              </button>
                            ) : (
                              <span className="inline-flex size-8 shrink-0" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-xs font-black text-[#0c1421] uppercase tracking-tight">{root.name}</span>
                            {root.childCount === 0 && (
                              <div className="flex shrink-0 items-center gap-2 pr-2">
                                <label className="flex items-center gap-2 cursor-pointer group/label">
                                  <div className={`size-4 rounded border transition-all flex items-center justify-center ${selectedIds.has(root.id) ? "bg-blue-500 border-blue-500" : "bg-white border-slate-200 group-hover/label:border-blue-300"}`}>
                                    {selectedIds.has(root.id) && <Plus className="size-3 text-white" />}
                                  </div>
                                  <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={selectedIds.has(root.id)}
                                    disabled={isPending}
                                    onChange={(e) => toggleId(root.id, root.name, e.target.checked)}
                                  />
                                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover/label:text-blue-500 transition-colors">Assign</span>
                                </label>
                              </div>
                            )}
                          </div>

                          {expanded && root.childCount > 0 && (
                            <div className="bg-white/40 px-3 py-3 space-y-3 animate-in slide-in-from-top-2 duration-300">
                              {sub?.loading && (
                                <div className="flex items-center gap-2 py-1">
                                  <div className="size-3 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Parsing Projects…</p>
                                </div>
                              )}
                              {!sub?.loading && sub && sub.items.length === 0 && !sub.hasMore && (
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest py-1">
                                  All Projects synchronized.
                                </p>
                              )}
                              {sub && sub.items.length > 0 && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-2 border-b border-white/20 pb-2">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Project Directory</span>
                                    <label className="flex items-center gap-1.5 cursor-pointer group/all">
                                      <div className={`size-3.5 rounded border transition-all flex items-center justify-center ${false ? "bg-blue-500 border-blue-500" : "bg-white/60 border-slate-200 group-hover/all:border-blue-300"}`}>
                                          <Plus className={`size-2.5 text-blue-500 transition-opacity ${false ? "opacity-100" : "opacity-0"}`} />
                                      </div>
                                      <input
                                        type="checkbox"
                                        className="sr-only"
                                        disabled={isPending}
                                        onChange={(e) => selectAllLoadedSubs(root.id, e.target.checked)}
                                      />
                                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover/all:text-blue-500 transition-colors">Assign All</span>
                                    </label>
                                  </div>
                                  <ul className="grid gap-1.5">
                                    {sub.items.map((sp) => (
                                      <li key={sp.id}>
                                        <label className="flex cursor-pointer items-center gap-2.5 group/node">
                                          <div className={`size-4 rounded border transition-all flex items-center justify-center ${selectedIds.has(sp.id) ? "bg-blue-500 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-white border-slate-200 group-hover/node:border-blue-300"}`}>
                                            {selectedIds.has(sp.id) && <Plus className="size-3 text-white" />}
                                          </div>
                                          <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={selectedIds.has(sp.id)}
                                            disabled={isPending}
                                            onChange={(e) => toggleId(sp.id, sp.name, e.target.checked)}
                                          />
                                          <span className="text-[11px] font-bold text-[#0c1421] truncate uppercase tracking-tight">{sp.name}</span>
                                        </label>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {sub?.hasMore && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-full text-[9px] font-black uppercase tracking-widest border-white/20 bg-white/20 hover:bg-white/40"
                                  disabled={sub.loading || isPending}
                                  onClick={() => void loadSubPage(root.id, (sub?.page ?? 0) + 1, true)}
                                >
                                  {sub.loading ? "Parsing…" : "Fetch more Projects (10)"}
                                </Button>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {rootHasMore && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 w-full text-[9px] font-black uppercase tracking-widest border-white/20 bg-white/20 hover:bg-white/40"
                    disabled={loadingRoots || isPending}
                    onClick={() => void loadRootPage(rootPage + 1, true)}
                  >
                    {loadingRoots ? "Parsing…" : "Fetch more directories (10)"}
                  </Button>
                )}

                {selectionCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-10 w-full bg-[#0c1421] text-white hover:bg-black rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95"
                    disabled={isPending}
                    onClick={openBatchConfirm}
                  >
                    assign ({selectionCount})
                  </Button>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog
        open={batchOpen}
        onOpenChange={(next) => {
          setBatchOpen(next);
          if (!next) setPendingBatch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign selected projects?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span className="block">
                Assign <span className="font-medium text-foreground">{batchCount}</span> project
                {batchCount === 1 ? "" : "s"} to{" "}
                <span className="font-medium text-foreground">{displayName}</span>?
              </span>
              <ul className="max-h-32 list-inside list-disc overflow-y-auto text-xs text-muted-foreground">
                {batchPreview.map((label, i) => (
                  <li key={pendingBatch?.ids[i] ?? `${label}-${i}`}>{label}</li>
                ))}
                {batchCount > 8 && <li className="list-none">…and {batchCount - 8} more</li>}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={confirmBatchAssign}
              disabled={isPending || batchCount === 0}
            >
              Yes, assign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from project?</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to remove{" "}
              <span className="font-medium text-foreground">{displayName}</span> from{" "}
              <span className="font-medium text-foreground">{pendingRemove?.name}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingRemove(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
