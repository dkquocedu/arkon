"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { UserStoryPanel } from "@/components/requirements/user-story-panel";

type URLabel = { id: string; name: string; color: string };

type URDetail = {
  id: string;
  requirement_id: string;
  title: string;
  description?: string;
  acceptance_criteria?: string;
  status: string;
  priority: string;
  project_name?: string;
  assignee_name?: string;
  source_text?: string;
  jira_key?: string;
  jira_url?: string;
  labels: URLabel[];
  valid_transitions: string[];
  created_at: string;
  updated_at: string;
  approved_at?: string;
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700" },
  analysis: { label: "Analysis", className: "bg-blue-100 text-blue-700" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700" },
  dev_ready: { label: "Dev Ready", className: "bg-purple-100 text-purple-700" },
  done: { label: "Done", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700" },
};

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "text-red-600" },
  high: { label: "High", className: "text-orange-500" },
  medium: { label: "Medium", className: "text-yellow-600" },
  low: { label: "Low", className: "text-green-600" },
};

export default function RequirementDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [ur, setUr] = useState<URDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    api<URDetail>(`/api/requirements/${id}`)
      .then((data) => { if (active) setUr(data); })
      .catch(() => { if (active) setNotFound(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <span className="material-symbols-outlined text-3xl text-muted-foreground animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  if (notFound || !ur) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-3 text-muted-foreground">
        <span
          className="material-symbols-outlined text-5xl opacity-30"
          style={{ fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
        >
          search_off
        </span>
        <p className="text-sm">Requirement not found.</p>
        <Link href="/requirements" className="text-sm text-primary hover:underline">
          Back to Requirements
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[ur.status] ?? { label: ur.status, className: "bg-gray-100 text-gray-600" };
  const priorityCfg = PRIORITY_CONFIG[ur.priority] ?? { label: ur.priority, className: "text-gray-500" };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={ur.title}
        description={
          <Link
            href="/requirements"
            className="flex items-center gap-1 text-muted-foreground/70 hover:text-foreground text-sm transition-colors"
          >
            <span
              className="material-symbols-outlined text-[14px]"
              style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 14" }}
            >
              arrow_back
            </span>
            Requirements
          </Link>
        }
      />

      {/* UR Info Card */}
      <div className="rounded-2xl border border-border/50 bg-background/40 p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] text-muted-foreground/60 bg-muted/40 rounded px-2 py-0.5">
            {ur.requirement_id}
          </span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-medium", statusCfg.className)}>
            {statusCfg.label}
          </span>
          <span className={cn("text-[12px] font-medium", priorityCfg.className)}>
            {priorityCfg.label}
          </span>
          {ur.project_name && (
            <span className="text-[12px] text-muted-foreground/60">{ur.project_name}</span>
          )}
          {ur.assignee_name && (
            <span className="text-[12px] text-muted-foreground/60">• {ur.assignee_name}</span>
          )}
          {ur.labels.map((label) => (
            <span
              key={label.id}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
          {ur.jira_key && (
            <span className="font-mono text-[11px] text-blue-600">{ur.jira_key}</span>
          )}
        </div>

        {ur.description && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/50 font-medium mb-1.5">
              Description
            </p>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {ur.description}
            </p>
          </div>
        )}

        {ur.acceptance_criteria && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/50 font-medium mb-1.5">
              Acceptance Criteria
            </p>
            <pre className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap font-sans">
              {ur.acceptance_criteria}
            </pre>
          </div>
        )}
      </div>

      {/* User Stories Section */}
      <div className="rounded-2xl border border-border/50 bg-background/40 p-5">
        <UserStoryPanel urId={ur.id} urStatus={ur.status} />
      </div>
    </div>
  );
}
