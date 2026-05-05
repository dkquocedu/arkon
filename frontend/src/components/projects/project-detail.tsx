"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { api, apiUpload } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { WikiTypeBadge, wikiTypeGroupLabel, wikiTypeColor, wikiTypeIcon } from "@/components/wiki/wiki-type-badge";
import { WikiPageTree } from "@/components/wiki/wiki-page-tree";
import { WikiContent } from "@/components/wiki/wiki-content";
import { WikiSidebarRight } from "@/components/wiki/wiki-backlinks";
import { WikiGraph } from "@/components/wiki/wiki-graph";
import { ScopeBadge } from "@/components/shared/scope-badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { WikiGraphData, WikiPageDetail, WikiPageSummary } from "@/types/wiki";

const WIKI_TYPE_TABS = ["all", "entity", "concept", "topic", "source"] as const;

type Project = {
  id: string;
  name: string;
  description?: string;
  workspace_type: string;
  status: string;
  member_count: number;
  source_count: number;
};

type Member = {
  employee_id: string;
  employee_name: string;
  employee_email: string;
  role: string;
};

type ProjectSource = {
  source_id: string;
  title?: string;
  source_type?: string;
  file_name?: string;
  status: string;
  progress?: number;
  progress_message?: string;
  knowledge_type_name?: string;
  added_at?: string;
};

type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Source = {
  id: string;
  title?: string;
  source_type?: string;
  status: string;
  knowledge_type_name?: string;
};

type Props = {
  project: Project;
  isAdmin: boolean;
  onBack: () => void;
};

const fileIcons: Record<string, string> = {
  pdf: "picture_as_pdf",
  docx: "description",
  xlsx: "table_chart",
  csv: "table_chart",
  txt: "article",
  md: "article",
  pptx: "slideshow",
};

function getFileExt(s: ProjectSource): string {
  const name = s.file_name || "";
  return name.split(".").pop()?.toLowerCase() || "";
}

export function ProjectDetail({ project, isAdmin, onBack }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [sources, setSources] = useState<ProjectSource[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [allSources, setAllSources] = useState<Source[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"wiki" | "sources" | "members">("wiki");
  const [wikiPages, setWikiPages] = useState<WikiPageSummary[]>([]);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiIndexMd, setWikiIndexMd] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [wikiTypeTab, setWikiTypeTab] = useState<string>("all");
  const [selectedWikiSlug, setSelectedWikiSlug] = useState<string | null>(null);
  const [selectedWikiPage, setSelectedWikiPage] = useState<WikiPageDetail | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const [showAddDocModal, setShowAddDocModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([
        api<Member[]>(`/api/projects/${project.id}/members`),
        api<ProjectSource[]>(`/api/projects/${project.id}/sources`),
      ]);
      setMembers(m);
      setSources(s);
    } catch {
      setMembers([]);
      setSources([]);
    }
  }, [project.id]);

  useEffect(() => {
    load();
    if (isAdmin) {
      Promise.all([
        api<{ items: Employee[] }>("/api/employees?page_size=200"),
        api<{ items: Source[] }>("/api/sources?page_size=200"),
      ]).then(([empRes, srcRes]) => {
        setAllEmployees(empRes.items);
        setAllSources(srcRes.items);
      }).catch(() => { });
    }
  }, [load, isAdmin]);

  // Load wiki pages + index from server-side scoped endpoint
  useEffect(() => {
    if (tab !== "wiki") return;
    setWikiLoading(true);
    Promise.all([
      api<WikiPageSummary[]>(`/api/projects/${project.id}/wiki?limit=200`),
      api<{ content_md: string }>(`/api/projects/${project.id}/wiki/index`).catch(() => ({ content_md: "" })),
    ])
      .then(([pages, idx]) => {
        setWikiPages(Array.isArray(pages) ? pages : []);
        setWikiIndexMd(idx.content_md || null);
      })
      .catch(() => { setWikiPages([]); setWikiIndexMd(null); })
      .finally(() => setWikiLoading(false));
  }, [tab, project.id]);

  // Wiki stats
  const wikiTypeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of wikiPages) c[p.page_type] = (c[p.page_type] ?? 0) + 1;
    return c;
  }, [wikiPages]);

  const displayWikiPages = useMemo(() => {
    return wikiTypeTab === "all"
      ? wikiPages
      : wikiPages.filter((p) => p.page_type === wikiTypeTab);
  }, [wikiPages, wikiTypeTab]);

  // Polling: refresh sources while any are pending/processing
  const hasInProgress = sources.some((s) => s.status === "pending" || s.status === "processing");
  useEffect(() => {
    if (!hasInProgress) return;
    const timer = setInterval(async () => {
      try {
        const s = await api<ProjectSource[]>(`/api/projects/${project.id}/sources`);
        setSources(s);
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(timer);
  }, [hasInProgress, project.id]);

  const handleAddMember = async () => {
    if (!selectedEmpId) return;
    setError(null);
    try {
      await api(`/api/projects/${project.id}/members`, {
        method: "POST",
        body: { employee_id: selectedEmpId, role: "member" },
      });
      setSelectedEmpId("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    }
  };

  const handleRemoveMember = async (empId: string) => {
    if (!confirm("Remove this member from the project?")) return;
    setError(null);
    try {
      await api(`/api/projects/${project.id}/members/${empId}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const handleAddSource = async () => {
    if (!selectedSourceId) return;
    setError(null);
    try {
      await api(`/api/projects/${project.id}/sources`, {
        method: "POST",
        body: { source_id: selectedSourceId },
      });
      setSelectedSourceId("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add document");
    }
  };

  const handleRemoveSource = async (sourceId: string) => {
    if (!confirm("Remove this document from the workspace?")) return;
    setError(null);
    try {
      await api(`/api/projects/${project.id}/sources/${sourceId}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove document");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);
      await apiUpload(`/api/projects/${project.id}/sources/upload`, formData);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const memberIds = new Set(members.map((m) => m.employee_id));
  const sourceIds = new Set(sources.map((s) => s.source_id));
  const availableEmployees = allEmployees.filter((e) => !memberIds.has(e.id));
  const availableSources = allSources.filter((s) => !sourceIds.has(s.id));

  const tabConfig = [
    { key: "wiki" as const, label: "Wiki", count: wikiPages.length, icon: "auto_stories" },
    { key: "sources" as const, label: "Documents", count: sources.length, icon: "description" },
    { key: "members" as const, label: "Members", count: members.length, icon: "group" },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 2-col header: left = back + title, right = tabs */}
      <div className="flex items-end gap-4 pb-4">
        {/* Left: back button + project identity */}
        <div className="flex items-center gap-3 pb-3 shrink-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            <span className="ml-1 text-sm">Back</span>
          </Button>
          <div className="w-px h-5 bg-border" />
          <span className="material-symbols-outlined text-primary text-lg">
            {project.workspace_type === "customer" ? "domain" : "folder_special"}
          </span>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold font-serif leading-tight truncate max-w-[260px]">
                {project.name}
              </h1>
              <Badge
                variant="outline"
                className={project.status === "active" ? "text-green-600 border-green-300 text-xs" : "text-muted-foreground text-xs"}
              >
                {project.status}
              </Badge>
            </div>
            {project.description && (
              <p className="text-xs text-muted-foreground truncate max-w-[260px]">{project.description}</p>
            )}
          </div>
        </div>

        {/* Right: tabs flush to bottom of header row */}
        <div className="flex items-end gap-1 flex-1 justify-end">
          {tabConfig.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              <span className="material-symbols-outlined text-base">{t.icon}</span>
              {t.label}
              <span className="ml-1 tabular-nums text-xs text-muted-foreground">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          {error}
        </div>
      )}

      {/* ================================================================ */}
      {/* Members tab                                                      */}
      {/* ================================================================ */}
      {tab === "members" && (
        <div className="flex flex-col gap-4">
          {isAdmin && (
            <div className="bg-card rounded-xl border border-border shadow-sahara p-4 flex gap-2">
              <Select value={selectedEmpId} onValueChange={(v) => setSelectedEmpId(v ?? "")}>
                <SelectTrigger className="bg-background flex-1">
                  {selectedEmpId ? (
                    <span className="truncate">
                      {(() => {
                        const emp = availableEmployees.find((e) => e.id === selectedEmpId);
                        return emp ? `${emp.name} — ${emp.email}` : selectedEmpId;
                      })()}
                    </span>
                  ) : (
                    <SelectValue placeholder="Select employee to add..." />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {availableEmployees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} — {e.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!selectedEmpId}
                onClick={handleAddMember}
                className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
              >
                Add
              </Button>
            </div>
          )}

          {members.length === 0 ? (
            <div className="bg-card rounded-xl border border-border shadow-sahara">
              <EmptyState icon="group" title="No members yet" description="Add employees to give them access to this workspace's knowledge." />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {members.map((m) => (
                <div
                  key={m.employee_id}
                  className="bg-card rounded-xl border border-border shadow-sahara p-4 flex items-start gap-3 group hover:border-primary/20 transition-all"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary text-sm">person</span>
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">{m.employee_name}</span>
                    <span className="text-xs text-muted-foreground truncate">{m.employee_email}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs capitalize">{m.role}</Badge>
                    {isAdmin && (
                      <button
                        onClick={() => handleRemoveMember(m.employee_id)}
                        className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* Documents tab — card-based layout with Add Document modal       */}
      {/* ================================================================ */}
      {tab === "sources" && (
        <div className="flex flex-col gap-5">
          {/* Stats bar + Add button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {sources.length > 0 && (
                <>
                  <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2 shadow-sahara">
                    <span className="material-symbols-outlined text-sm text-primary">description</span>
                    <span className="text-sm font-semibold">{sources.length}</span>
                    <span className="text-xs text-muted-foreground">Documents</span>
                  </div>
                  {(() => {
                    const ready = sources.filter(s => s.status === "ready").length;
                    const processing = sources.filter(s => s.status === "processing" || s.status === "pending").length;
                    const errored = sources.filter(s => s.status === "error").length;
                    return (
                      <>
                        {ready > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            {ready} ready
                          </div>
                        )}
                        {processing > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                            {processing} processing
                          </div>
                        )}
                        {errored > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-destructive">
                            <span className="w-2 h-2 rounded-full bg-destructive" />
                            {errored} failed
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
            {isAdmin && (
              <Button
                onClick={() => setShowAddDocModal(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                size="sm"
              >
                <span className="material-symbols-outlined text-base mr-1.5">add</span>
                Add Document
              </Button>
            )}
          </div>

          {/* Document cards */}
          {sources.length === 0 ? (
            <div className="bg-card rounded-xl border border-border shadow-sahara py-16 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }}>folder_open</span>
              </div>
              <h3 className="text-base font-heading text-foreground">No documents yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm text-center">
                Upload files or link existing documents to build this workspace's knowledge base.
              </p>
              {isAdmin && (
                <Button
                  onClick={() => setShowAddDocModal(true)}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  <span className="material-symbols-outlined text-base mr-1.5">add</span>
                  Add your first document
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sources.map((s) => {
                const ext = getFileExt(s);
                const icon = fileIcons[ext] || (s.source_type === "url" ? "link" : "description");
                const isProcessing = s.status === "processing" || s.status === "pending";
                return (
                  <div
                    key={s.source_id}
                    className="group bg-card border border-border rounded-xl px-4 py-3.5 hover:border-primary/30 hover:shadow-sahara transition-all flex items-center gap-3"
                  >
                    {/* File icon */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${s.status === "ready" ? "bg-green-500/10" :
                      s.status === "error" ? "bg-destructive/10" :
                        "bg-primary/10"
                      }`}>
                      <span className={`material-symbols-outlined ${s.status === "ready" ? "text-green-600" :
                        s.status === "error" ? "text-destructive" :
                          "text-primary"
                        }`} style={{ fontSize: 18 }}>
                        {icon}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {s.title || s.source_id}
                        </span>
                        {ext && (
                          <span className="text-[10px] font-medium text-muted-foreground uppercase bg-accent/50 px-1.5 py-0.5 rounded shrink-0">
                            {ext}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {s.knowledge_type_name && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-medium">
                            {s.knowledge_type_name}
                          </Badge>
                        )}
                        {isProcessing && s.progress_message && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={s.progress_message}>
                            {s.progress_message}
                          </span>
                        )}
                      </div>
                      {/* Progress bar for processing */}
                      {isProcessing && s.progress !== undefined && (
                        <div className="mt-1.5 h-1 bg-border rounded-full overflow-hidden w-full max-w-[200px]">
                          <div
                            className="h-full bg-primary/70 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(s.progress, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Status + date + actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${s.status === "ready" ? "bg-green-500" :
                          s.status === "processing" ? "bg-yellow-500 animate-pulse" :
                            s.status === "error" ? "bg-destructive" :
                              "bg-muted-foreground"
                          }`} />
                        <span className="text-xs capitalize text-muted-foreground">{s.status}</span>
                        {s.status === "processing" && s.progress !== undefined && (
                          <span className="text-xs text-muted-foreground tabular-nums">({s.progress}%)</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {s.added_at ? new Date(s.added_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                      </span>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent text-muted-foreground transition-opacity">
                            <span className="material-symbols-outlined text-base">more_vert</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleRemoveSource(s.source_id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <span className="material-symbols-outlined text-base mr-2">delete</span>
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Document Modal */}
      <AddDocumentModal
        open={showAddDocModal}
        onOpenChange={setShowAddDocModal}
        projectId={project.id}
        availableSources={availableSources}
        onDone={() => { load(); setShowAddDocModal(false); }}
      />

      {/* ================================================================ */}
      {/* Wiki tab — inline viewer, no route changes                        */}
      {/* ================================================================ */}
      {tab === "wiki" && (
        showGraph ? (
          <WikiGraphInline
            projectId={project.id}
            onBack={() => setShowGraph(false)}
          />
        ) : (
          <div className="flex gap-0 -mx-6 md:-mx-8 -mb-6 md:-mb-8 flex-1 min-h-0 border-t border-border overflow-hidden">
            {/* Page Tree sidebar — scoped to workspace */}
            <WikiPageTree
              pagesUrl={`/api/projects/${project.id}/wiki?limit=200`}
              activeSlug={selectedWikiSlug ?? undefined}
              onPageSelect={(slug) => { setSelectedWikiSlug(slug); setSelectedWikiPage(null); }}
            />

            {/* Content area */}
            <div className="flex-1 overflow-y-auto px-8 py-6 min-w-0">
              {selectedWikiSlug ? (
                /* ---- Inline wiki page detail view ---- */
                <WikiDetailInline
                  slug={selectedWikiSlug}
                  projectId={project.id}
                  onBack={() => { setSelectedWikiSlug(null); setSelectedWikiPage(null); }}
                  onPageLoaded={setSelectedWikiPage}
                  onNavigate={(slug) => { setSelectedWikiSlug(slug); setSelectedWikiPage(null); }}
                />
              ) : (
                /* ---- Wiki pages list view ---- */
                <>
                  {wikiLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <span className="material-symbols-outlined text-3xl text-muted-foreground animate-spin">
                        progress_activity
                      </span>
                    </div>
                  ) : wikiPages.length === 0 ? (
                    <EmptyState
                      icon="auto_stories"
                      title="No wiki pages yet"
                      description="Upload documents in this workspace to automatically compile knowledge into wiki pages."
                    />
                  ) : (
                    <>
                      {/* Stats bar + Graph View button on same row */}
                      <div className="flex flex-wrap items-center gap-3 mb-8">
                        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5 shadow-sahara">
                          <span className="material-symbols-outlined text-base text-primary">article</span>
                          <span className="text-sm font-semibold text-foreground">{wikiPages.length}</span>
                          <span className="text-xs text-muted-foreground">Pages</span>
                        </div>
                        {Object.entries(wikiTypeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                          <div
                            key={type}
                            className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-3 py-2.5 shadow-sahara"
                          >
                            <WikiTypeBadge type={type} />
                            <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 ml-auto">
                          {wikiPages[0]?.updated_at && (
                            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5 shadow-sahara">
                              <span className="material-symbols-outlined text-base text-muted-foreground">schedule</span>
                              <span className="text-xs text-muted-foreground">
                                Updated {new Date(wikiPages[0].updated_at).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            </div>
                          )}
                          <button
                            onClick={() => setShowGraph(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sahara"
                          >
                            <span className="material-symbols-outlined text-base">hub</span>
                            Graph View
                          </button>
                        </div>
                      </div>

                      {/* Wiki Index content — mirrors /wiki page */}
                      {wikiIndexMd && (
                        <WikiContent markdown={wikiIndexMd} />
                      )}

                      {/* Type filter tabs */}
                      <div className="flex items-center gap-1 mb-5 border-b border-border">
                        {WIKI_TYPE_TABS.map((wt) => {
                          const count = wt === "all"
                            ? wikiPages.length
                            : wikiTypeCounts[wt] ?? 0;
                          if (wt !== "all" && count === 0) return null;
                          return (
                            <button
                              key={wt}
                              onClick={() => setWikiTypeTab(wt)}
                              className={`px-3 py-2 text-xs font-medium capitalize border-b-2 transition-colors ${wikiTypeTab === wt
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                            >
                              {wt === "all" ? "All" : wikiTypeGroupLabel(wt)}
                              <span className="ml-1.5 tabular-nums text-muted-foreground">
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Wiki page cards — click opens inline */}
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {displayWikiPages.map((page) => (
                          <button
                            key={page.slug}
                            onClick={() => setSelectedWikiSlug(page.slug)}
                            className="group block bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sahara transition-all text-left"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <WikiTypeBadge type={page.page_type} />
                                <ScopeBadge scopeType="workspace" />
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0">
                                v{page.version}
                              </span>
                            </div>
                            <h3 className="font-heading text-base font-normal text-foreground group-hover:text-primary transition-colors mb-1">
                              {page.title}
                            </h3>
                            {page.summary && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {page.summary}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-3">
                              {new Date(page.updated_at).toLocaleDateString()}
                            </p>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Right sidebar — shown when viewing a page, mirrors standalone wiki */}
            {selectedWikiSlug && selectedWikiPage && (
              <div className="hidden lg:flex shrink-0 overflow-hidden">
                <WikiSidebarRight slug={selectedWikiSlug} page={selectedWikiPage} />
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

/* ================================================================ */
/* Inline wiki page detail viewer                                    */
/* ================================================================ */
function WikiDetailInline({
  slug,
  projectId,
  onBack,
  onPageLoaded,
  onNavigate,
}: {
  slug: string;
  projectId: string;
  onBack: () => void;
  onPageLoaded: (page: WikiPageDetail) => void;
  onNavigate: (slug: string) => void;
}) {
  const [page, setPage] = useState<WikiPageDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setPage(null);
    api<WikiPageDetail>(`/api/wiki/pages/${encodeURIComponent(slug)}?scope_type=project&scope_id=${projectId}`)
      .then((data) => { setPage(data); onPageLoaded(data); })
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, [slug, projectId]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          <div className="h-4 w-24 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-10 w-2/3 rounded-lg bg-muted animate-pulse mb-3" />
        <div className="h-4 w-full rounded bg-muted animate-pulse mb-2" />
        <div className="h-4 w-5/6 rounded bg-muted animate-pulse mb-8" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-4 rounded bg-muted animate-pulse"
              style={{ width: `${85 - i * 5}%`, opacity: 1 - i * 0.08 }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <span className="material-symbols-outlined text-4xl text-muted-foreground">find_in_page</span>
        <p className="text-sm text-muted-foreground">Page not found: {slug}</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          <span className="material-symbols-outlined text-base mr-1">arrow_back</span>
          Back to list
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0 shadow-sm"
          title="Back to pages"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </button>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <button
            onClick={onBack}
            className="hover:text-foreground transition-colors font-medium"
          >
            Wiki
          </button>
          <span className="material-symbols-outlined text-muted-foreground/50" style={{ fontSize: 14 }}>chevron_right</span>
          <span className="capitalize font-medium">
            {wikiTypeGroupLabel(page.page_type)}
          </span>
          <span className="material-symbols-outlined text-muted-foreground/50" style={{ fontSize: 14 }}>chevron_right</span>
          <span className="text-foreground font-semibold truncate max-w-[200px]">
            {page.title}
          </span>
        </nav>
      </div>

      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <WikiTypeBadge type={page.page_type} />
          <ScopeBadge scopeType="workspace" />
          <span className="text-xs text-muted-foreground ml-auto">v{page.version}</span>
        </div>
        <h1 className="font-heading text-4xl font-normal leading-tight text-foreground">
          {page.title}
        </h1>
        {page.summary && (
          <p className="mt-2 text-muted-foreground text-sm leading-6">{page.summary}</p>
        )}
      </div>

      {/* Markdown body */}
      <WikiContent markdown={page.content_md} onWikiLinkClick={onNavigate} />
    </div>
  );
}

/* ================================================================ */
/* Inline graph viewer — mirrors /wiki/graph but scoped to project   */
/* ================================================================ */
const PAGE_TYPES = ["entity", "concept", "topic", "source"];

function WikiGraphInline({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [graphData, setGraphData] = useState<WikiGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(PAGE_TYPES));
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightSlug, setHighlightSlug] = useState<string | null>(null);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<WikiPageDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    api<WikiGraphData>(`/api/projects/${projectId}/wiki/graph`)
      .then(setGraphData)
      .catch(() => setGraphData(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!previewSlug) { setPreviewData(null); return; }
    setPreviewLoading(true);
    api<WikiPageDetail>(`/api/wiki/pages/${previewSlug}?scope_type=project&scope_id=${projectId}`)
      .then(setPreviewData)
      .catch(() => setPreviewData(null))
      .finally(() => setPreviewLoading(false));
  }, [previewSlug, projectId]);

  const filteredData = useMemo(() => {
    if (!graphData) return null;
    const nodes = graphData.nodes.filter((n) => activeTypes.has(n.page_type));
    const slugSet = new Set(nodes.map((n) => n.slug));
    const edges = graphData.edges.filter((e) => slugSet.has(e.from) && slugSet.has(e.to));
    return { nodes, edges };
  }, [graphData, activeTypes]);

  const searchMatches = useMemo(() => {
    if (!searchQuery || !graphData) return [];
    const q = searchQuery.toLowerCase();
    return graphData.nodes.filter((n) => n.title.toLowerCase().includes(q) || n.slug.includes(q));
  }, [searchQuery, graphData]);

  return (
    <div
      className="relative flex flex-col -mx-6 md:-mx-8 -mb-6 md:-mb-8 flex-1 min-h-0 border-t border-border bg-background"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-accent/50"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-muted-foreground">hub</span>
            <span className="text-sm font-semibold text-foreground">Workspace Graph</span>
          </div>
          {graphData && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-1">
              <span className="rounded-md bg-muted px-2 py-0.5 tabular-nums font-medium">
                {filteredData?.nodes.length ?? 0} pages
              </span>
              <span className="rounded-md bg-muted px-2 py-0.5 tabular-nums font-medium">
                {filteredData?.edges.length ?? 0} links
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-2.5 py-1.5">
            <span className="material-symbols-outlined text-sm text-muted-foreground">search</span>
            <input
              type="text"
              placeholder="Find node..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                const match = graphData?.nodes.find((n) =>
                  n.title.toLowerCase().includes(e.target.value.toLowerCase())
                );
                setHighlightSlug(match?.slug ?? null);
              }}
              className="w-36 text-xs bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setHighlightSlug(null); }} className="text-muted-foreground hover:text-foreground">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>

          {/* Type filter chips */}
          <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
            {PAGE_TYPES.map((type) => {
              const active = activeTypes.has(type);
              const color = wikiTypeColor(type);
              return (
                <button
                  key={type}
                  onClick={() => setActiveTypes((prev) => {
                    const next = new Set(prev);
                    next.has(type) ? next.delete(type) : next.add(type);
                    return next;
                  })}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-all border"
                  style={{
                    background: active ? `${color}14` : "transparent",
                    color: active ? color : "var(--color-muted-foreground, #78706a)",
                    borderColor: active ? `${color}30` : "transparent",
                  }}
                  title={wikiTypeGroupLabel(type)}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: active ? color : "var(--color-muted-foreground, #78706a)" }} />
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{wikiTypeIcon(type)}</span>
                  <span className="hidden sm:inline">{wikiTypeGroupLabel(type)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search dropdown */}
      {searchQuery && searchMatches.length > 0 && (
        <div className="absolute top-[52px] right-5 z-20 bg-card border border-border rounded-xl shadow-lg py-1 max-h-48 overflow-y-auto w-64">
          {searchMatches.slice(0, 8).map((n) => (
            <button
              key={n.slug}
              onClick={() => { setHighlightSlug(n.slug); setSearchQuery(""); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent/50 transition-colors"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: wikiTypeColor(n.page_type) }} />
              <span className="truncate font-medium text-foreground">{n.title}</span>
              <span className="text-muted-foreground ml-auto capitalize text-[10px]">{n.page_type}</span>
            </button>
          ))}
        </div>
      )}

      {/* Graph canvas */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
          </div>
        ) : !filteredData || filteredData.nodes.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <span className="material-symbols-outlined text-5xl text-muted-foreground/30">hub</span>
            <p className="text-sm text-muted-foreground font-medium">No wiki pages yet</p>
          </div>
        ) : (
          <WikiGraph
            nodes={filteredData.nodes}
            edges={filteredData.edges}
            centerSlug={highlightSlug ?? undefined}
            height={undefined}
            onNodeClick={(slug) => setPreviewSlug(slug)}
          />
        )}
      </div>

      {/* Preview sheet */}
      <Sheet open={!!previewSlug} onOpenChange={(open) => !open && setPreviewSlug(null)}>
        <SheetContent showCloseButton={false} className="w-[400px] sm:w-[540px] p-0 flex flex-col border-l border-border gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border bg-card shrink-0 flex flex-row items-center justify-between space-y-0">
            <SheetTitle className="text-lg font-heading flex-1 truncate pr-4 text-left">
              {previewLoading ? "Loading..." : previewData?.title ?? previewSlug}
            </SheetTitle>
            <SheetClose
              render={<Button variant="ghost" size="icon-sm" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" />}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </SheetClose>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-6 bg-background">
            {previewLoading ? (
              <div className="flex items-center justify-center py-16">
                <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
              </div>
            ) : previewData ? (
              <WikiContent markdown={previewData.content_md} />
            ) : (
              <p className="text-sm text-muted-foreground py-16 text-center">Failed to load content.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ================================================================== */
/* AddDocumentModal — Upload or Link existing documents               */
/* ================================================================== */
const ALLOWED_EXTS = [".pdf", ".docx", ".doc", ".xlsx", ".csv", ".txt", ".md", ".pptx"];
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

function AddDocumentModal({
  open,
  onOpenChange,
  projectId,
  availableSources,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  availableSources: Source[];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setSelectedFile(null);
    setFileError(null);
    setError(null);
    setSelectedSourceId("");
    setUploading(false);
    setLinking(false);
  };

  const validateFile = (file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) return `Unsupported file type: ${ext}`;
    if (file.size > MAX_SIZE) return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: 50 MB`;
    return null;
  };

  const handleFile = (file: File) => {
    setFileError(null);
    const err = validateFile(file);
    if (err) { setFileError(err); return; }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", selectedFile.name);
      await apiUpload(`/api/projects/${projectId}/sources/upload`, formData);
      reset();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleLink = async () => {
    if (!selectedSourceId) return;
    setLinking(true);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/sources`, {
        method: "POST",
        body: { source_id: selectedSourceId },
      });
      reset();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link document");
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-lg font-heading">Add Document</DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex border-b border-border mx-6">
          {(["upload", "link"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${mode === m
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              <span className="material-symbols-outlined text-sm">
                {m === "upload" ? "cloud_upload" : "add"}
              </span>
              {m === "upload" ? "Upload File" : "Add Existing"}
            </button>
          ))}
        </div>

        <div className="px-6 pb-6 pt-4">
          {/* Error */}
          {error && (
            <div className="mb-4 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              {error}
            </div>
          )}

          {mode === "upload" ? (
            /* ---- Upload tab ---- */
            <div className="flex flex-col gap-4">
              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-8 flex flex-col items-center gap-3 transition-all ${dragOver
                  ? "border-primary bg-primary/5"
                  : selectedFile
                    ? "border-green-400/50 bg-green-500/5"
                    : "border-border hover:border-primary/40 hover:bg-primary/5"
                  }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={ALLOWED_EXTS.join(",")}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
                {selectedFile ? (
                  <>
                    <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-green-600" style={{ fontSize: 22 }}>check_circle</span>
                    </div>
                    <div className="text-center min-w-0 max-w-full">
                      <p className="text-sm font-medium text-foreground truncate max-w-[360px]">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(selectedFile.size / 1024).toFixed(0)} KB · Click to change
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${dragOver ? "bg-primary/20" : "bg-primary/10"
                      }`}>
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: 22 }}>cloud_upload</span>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">
                        {dragOver ? "Drop file here" : "Drag & drop or click to browse"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        PDF, DOCX, XLSX, CSV, TXT, MD, PPTX · Max 50 MB
                      </p>
                    </div>
                  </>
                )}
              </div>

              {fileError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  {fileError}
                </p>
              )}

              <Button
                disabled={!selectedFile || uploading}
                onClick={handleUpload}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {uploading ? (
                  <>
                    <span className="material-symbols-outlined text-base mr-2 animate-spin">progress_activity</span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base mr-2">upload</span>
                    Upload
                  </>
                )}
              </Button>
            </div>
          ) : (
            /* ---- Link tab ---- */
            <div className="flex flex-col gap-4">
              {availableSources.length === 0 ? (
                <div className="py-8 flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-3xl text-muted-foreground/40">description</span>
                  <p className="text-sm text-muted-foreground">No available documents to link</p>
                  <p className="text-xs text-muted-foreground">All documents are already in this workspace.</p>
                </div>
              ) : (
                <>
                  <Select value={selectedSourceId} onValueChange={(v) => setSelectedSourceId(v ?? "")}>
                    <SelectTrigger className="bg-background w-full">
                      {selectedSourceId ? (
                        <span className="truncate">
                          {availableSources.find(s => s.id === selectedSourceId)?.title || selectedSourceId}
                        </span>
                      ) : (
                        <SelectValue placeholder="Select an existing document to add..." />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {availableSources.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm text-muted-foreground">
                              {s.source_type === "url" ? "link" : "description"}
                            </span>
                            {s.title || s.id}
                            {s.knowledge_type_name && (
                              <span className="text-[10px] text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
                                {s.knowledge_type_name}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    disabled={!selectedSourceId || linking}
                    onClick={handleLink}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {linking ? (
                      <>
                        <span className="material-symbols-outlined text-base mr-2 animate-spin">progress_activity</span>
                        Linking...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base mr-2">add_link</span>
                        Link to Workspace
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
