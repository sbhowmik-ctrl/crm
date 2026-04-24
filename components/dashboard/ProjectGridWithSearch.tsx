"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ChevronRight } from "lucide-react";

import ArchiveProjectButton from "@/components/dashboard/ArchiveProjectButton";
import UnarchiveProjectButton from "@/components/dashboard/UnarchiveProjectButton";

export type ProjectCardRow = {
  id:              string;
  name:            string;
  description:     string | null;
  /** Full path for display and search, e.g. "my-proj" or "my-proj -> sub-a" */
  displayPath:     string;
  subprojectCount: number;
};

interface Props {
  rows:                 ProjectCardRow[];
  showProjectCardLink:  boolean;
  canArchive:           boolean;
  isLiveList:           boolean;
}

export default function ProjectGridWithSearch({
  rows,
  showProjectCardLink,
  canArchive,
  isLiveList,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      if (r.displayPath.toLowerCase().includes(q)) return true;
      if (r.description?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [rows, query]);

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 md:flex-row md:items-center justify-between px-2">
        <div className="relative w-full max-w-xl group">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2"
            style={{ color: "#475569" }}
          />
          <input
            id="project-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full h-10 bg-white/40 border border-white/40 backdrop-blur-md rounded-lg pl-10 pr-4 text-[13px] font-medium text-[#0c1421] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm transition-all"
            autoComplete="off"
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-black uppercase tracking-wide leading-none">{filtered.length} Projects Found</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white/30 backdrop-blur-md rounded-2xl border border-white/40 p-16 text-center space-y-4 animate-in fade-in zoom-in duration-500">
           <div className="size-12 bg-slate-100 rounded-xl mx-auto flex items-center justify-center text-slate-400">
            <Search className="size-6" />
          </div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">
            No matching Projects in the current directory.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
          {filtered.map((p) => (
            <div
              key={p.id}
              className={`group relative flex flex-col bg-white/40 backdrop-blur-md border border-white/40 p-6 rounded-2xl shadow-sm transition-all hover:bg-white/60 hover:shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-500 ${
                showProjectCardLink ? "cursor-pointer" : ""
              }`}
            >
              {showProjectCardLink && (
                <Link
                  href={`/dashboard/projects/${p.id}`}
                  className="absolute inset-0 z-[1] rounded-2xl"
                  aria-label={`Open project ${p.displayPath}`}
                />
              )}

              <div
                className={`relative z-[2] flex flex-col h-full gap-4 ${
                  showProjectCardLink ? "pointer-events-none" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1 text-[8px] font-black tracking-[0.2em] text-slate-400 uppercase">
                      {p.displayPath.split(" -> ").slice(0, -1).map((part, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {part} <ChevronRight className="size-2 text-slate-300" />
                        </span>
                      ))}
                    </div>
                    <h3 className="text-lg font-black text-[#0c1421] tracking-tight truncate uppercase leading-tight" title={p.displayPath}>
                      {p.displayPath.split(" -> ").pop()}
                    </h3>
                  </div>
                  {canArchive && (
                    <div className="relative z-[3] shrink-0 pointer-events-auto transition-transform group-hover:scale-110 space-x-1">
                      {isLiveList ? (
                        <ArchiveProjectButton projectId={p.id} projectName={p.name} />
                      ) : (
                        <UnarchiveProjectButton projectId={p.id} projectName={p.name} />
                      )}
                    </div>
                  )}
                </div>

                {p.description && (
                  <p className="text-[13px] text-slate-500 line-clamp-2 leading-relaxed font-medium">
                    {p.description}
                  </p>
                )}

                <div className="mt-auto pt-4 flex flex-wrap gap-4 border-t border-white/10">
                   <div className="flex flex-col gap-0.5">
                     <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Subprojects</span>
                     <div className="flex items-center gap-2">
                       <div className="size-1 bg-violet-500 rounded-full shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                       <span className="text-[13px] font-black text-[#0c1421] leading-none">{p.subprojectCount}</span>
                     </div>
                   </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
