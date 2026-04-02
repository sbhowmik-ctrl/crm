"use client";

import { useRouter } from "next/navigation";
import { NoteType } from "@prisma/client";
import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileText, Key, KeyRound } from "lucide-react";

import type { ApprovalsListResult } from "@/app/actions/pending-approvals";
import {
  approvePendingCredentialKey,
  approvePendingNote,
  approvePendingSecret,
  rejectPendingCredentialKey,
  rejectPendingNote,
  rejectPendingSecret,
} from "@/app/actions/pending-approvals";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function PendingApprovalsClient({ initial }: { initial: ApprovalsListResult }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>, ok: string) => {
    startTransition(async () => {
      const r = await fn();
      if (r.success) {
        toast.success(ok);
        router.refresh();
      } else {
        toast.error(r.error ?? "Something went wrong.");
      }
    });
  };

  const empty =
    initial.secrets.length === 0 &&
    initial.credentialKeys.length === 0 &&
    initial.notes.length === 0;

  return (
    <div className="space-y-16">
      {empty ? (
        <div className="bg-white/30 backdrop-blur-md rounded-2xl border border-white/40 p-16 text-center space-y-4 animate-in fade-in zoom-in duration-700">
          <div className="size-12 bg-slate-100 rounded-xl mx-auto flex items-center justify-center text-slate-400">
            <CheckCircle2 className="size-6 text-green-500" />
          </div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">
            Operational Clearance Verified. No Pending Actions.
          </p>
        </div>
      ) : null}

      {initial.secrets.length > 0 && (
        <section className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2 px-2">
            <div className="p-1.5 bg-[#0c1421] text-white rounded-lg shadow-lg">
              <Key className="size-3.5" />
            </div>
            <h2 className="text-lg font-black text-[#0c1421] uppercase tracking-tight">projects</h2>
          </div>

          <div className="max-h-[min(75vh,42rem)] overflow-auto rounded-2xl border border-white/40 bg-white/30 shadow-xl backdrop-blur-md">
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/10 hover:bg-transparent">
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entry Timestamp</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Project</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Token ID</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Submitted BY</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Access</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initial.secrets.map((s) => (
                    <TableRow key={s.id} className="border-b border-white/5 transition-colors hover:bg-white/5">
                      <TableCell className="px-8 py-5">
                        <div className="flex flex-col">
                           <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">{formatWhen(s.createdAt).split(", ")[0]}</span>
                           <span className="text-[10px] font-bold text-slate-400 tracking-tight">{formatWhen(s.createdAt).split(", ")[1]}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-8 py-5">
                        <span className="text-sm font-black text-[#0c1421] uppercase tracking-wide">{s.projectName}</span>
                      </TableCell>
                      <TableCell className="px-8 py-5">
                        <code className="px-2 py-1 bg-white/50 rounded-lg border border-white/20 text-[11px] font-black text-blue-600">{s.key}</code>
                      </TableCell>
                      <TableCell className="px-8 py-5">
                         <div className="flex items-center gap-2">
                            <div className="size-1.5 bg-indigo-500 rounded-full" />
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">{s.submitterName ?? s.submitterEmail ?? "—"}</span>
                         </div>
                      </TableCell>
                      <TableCell className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Button
                            size="sm"
                            className="h-8 px-6 bg-[#0c1421] hover:bg-[#1a2b45] text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                            disabled={isPending}
                            onClick={() =>
                              run(() => approvePendingSecret(s.id), "Secret approved.")
                            }
                          >
                            Authorize
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-6 rounded-lg border-white/20 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-red-50 hover:text-red-500 hover:border-red-500/20 transition-all"
                            disabled={isPending}
                            onClick={() =>
                              run(() => rejectPendingSecret(s.id), "Request rejected.")
                            }
                          >
                            Revoke
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}

      {initial.credentialKeys.length > 0 && (
        <section className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 delay-75">
          <div className="flex items-center gap-2 px-2">
            <div className="p-1.5 bg-[#0c1421] text-white rounded-lg shadow-lg">
              <KeyRound className="size-3.5" />
            </div>
            <h2 className="text-lg font-black text-[#0c1421] uppercase tracking-tight">Credentials</h2>
          </div>

          <div className="max-h-[min(75vh,42rem)] overflow-auto rounded-2xl border border-white/40 bg-white/30 shadow-xl backdrop-blur-md">
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/10 hover:bg-transparent">
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entry Timestamp</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Section</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Key</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Value (preview)</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Submitted BY</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Access</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initial.credentialKeys.map((c) => (
                    <TableRow key={c.id} className="border-b border-white/5 transition-colors hover:bg-white/5">
                      <TableCell className="px-8 py-5">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">{formatWhen(c.createdAt).split(", ")[0]}</span>
                          <span className="text-[10px] font-bold text-slate-400 tracking-tight">{formatWhen(c.createdAt).split(", ")[1]}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-8 py-5">
                        <span className="text-sm font-black text-[#0c1421] uppercase tracking-wide">{c.sectionName}</span>
                      </TableCell>
                      <TableCell className="px-8 py-5">
                        <code className="px-2 py-1 bg-white/50 rounded-lg border border-white/20 text-[11px] font-black text-blue-600">{c.label}</code>
                      </TableCell>
                      <TableCell className="px-8 py-5 max-w-xs">
                        <span className="text-[11px] font-mono text-slate-600 break-all">{c.valuePreview}</span>
                      </TableCell>
                      <TableCell className="px-8 py-5">
                        <div className="flex items-center gap-2">
                          <div className="size-1.5 bg-indigo-500 rounded-full" />
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">{c.submitterName ?? c.submitterEmail ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Button
                            size="sm"
                            className="h-8 px-6 bg-[#0c1421] hover:bg-[#1a2b45] text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                            disabled={isPending}
                            onClick={() =>
                              run(() => approvePendingCredentialKey(c.id), "Credential key approved.")
                            }
                          >
                            Authorize
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-6 rounded-lg border-white/20 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-red-50 hover:text-red-500 hover:border-red-500/20 transition-all"
                            disabled={isPending}
                            onClick={() =>
                              run(() => rejectPendingCredentialKey(c.id), "Request rejected.")
                            }
                          >
                            Revoke
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}

      {initial.notes.length > 0 && (
        <section className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 delay-150">
          <div className="flex items-center gap-2 px-2">
            <div className="p-1.5 bg-[#0c1421] text-white rounded-lg shadow-lg">
              <FileText className="size-3.5" />
            </div>
            <h2 className="text-lg font-black text-[#0c1421] uppercase tracking-tight">General Notes</h2>
          </div>

          <div className="max-h-[min(75vh,42rem)] overflow-auto rounded-2xl border border-white/40 bg-white/30 shadow-xl backdrop-blur-md">
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/10 hover:bg-transparent">
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entry Timestamp</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Project Title</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Access Level</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Project</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Submitted BY</TableHead>
                    <TableHead className="h-14 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Access</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initial.notes.map((n) => (
                    <TableRow key={n.id} className="border-b border-white/5 transition-colors hover:bg-white/5">
                      <TableCell className="px-8 py-5">
                         <div className="flex flex-col">
                           <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">{formatWhen(n.createdAt).split(", ")[0]}</span>
                           <span className="text-[10px] font-bold text-slate-400 tracking-tight">{formatWhen(n.createdAt).split(", ")[1]}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-8 py-5">
                        <span className="text-sm font-black text-[#0c1421] uppercase tracking-wide">{n.title}</span>
                      </TableCell>
                      <TableCell className="px-8 py-5">
                        <div className={`inline-flex px-2 px-1.5 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${
                           n.type === NoteType.NORMAL ? "bg-slate-100/50 text-slate-500 border-slate-200" : "bg-indigo-500/10 text-indigo-600 border-indigo-500/20"
                        }`}>
                          {n.type === NoteType.NORMAL ? "Global" : "Project-Locked"}
                        </div>
                      </TableCell>
                      <TableCell className="px-8 py-5">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{n.projectName ?? "—"}</span>
                      </TableCell>
                      <TableCell className="px-8 py-5">
                         <div className="flex items-center gap-2">
                            <div className="size-1.5 bg-blue-500 rounded-full" />
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">{n.submitterName ?? n.submitterEmail ?? "—"}</span>
                         </div>
                      </TableCell>
                      <TableCell className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Button
                            size="sm"
                            className="h-8 px-6 bg-[#0c1421] hover:bg-[#1a2b45] text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                            disabled={isPending}
                            onClick={() =>
                              run(() => approvePendingNote(n.id), "Note authorized.")
                            }
                          >
                            Authorize
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-6 rounded-lg border-white/20 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-red-50 hover:text-red-500 hover:border-red-500/20 transition-all"
                            disabled={isPending}
                            onClick={() =>
                              run(() => rejectPendingNote(n.id), "Request rejected.")
                            }
                          >
                            Revoke
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
