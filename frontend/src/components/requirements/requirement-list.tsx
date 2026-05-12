"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type URLabel = { id: string; name: string; color: string; description?: string };

export type ListRequirement = {
  id: string;
  requirement_id: string;
  title: string;
  description?: string;
  acceptance_criteria?: string;
  status: string;
  priority: string;
  project_id?: string;
  project_name?: string;
  assignee_id?: string;
  assignee_name?: string;
  source_text?: string;
  jira_key?: string;
  labels: URLabel[];
  valid_transitions: string[];
  created_at: string;
  updated_at: string;
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700 hover:bg-gray-200" },
  analysis: { label: "Analysis", className: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700 hover:bg-green-200" },
  dev_ready: { label: "Dev Ready", className: "bg-purple-100 text-purple-700 hover:bg-purple-200" },
  done: { label: "Done", className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700 hover:bg-red-200" },
};

const TRANSITION_LABELS: Record<string, string> = {
  draft: "Draft",
  analysis: "Analysis",
  approved: "Approved",
  dev_ready: "Dev Ready",
  done: "Done",
  rejected: "Rejected",
};

const PRIORITY_CONFIG: Record<string, { label: string; icon: string; className: string }> = {
  critical: { label: "Critical", icon: "priority_high", className: "text-red-600" },
  high: { label: "High", icon: "keyboard_arrow_up", className: "text-orange-500" },
  medium: { label: "Medium", icon: "remove", className: "text-yellow-600" },
  low: { label: "Low", icon: "keyboard_arrow_down", className: "text-green-600" },
};

type Props = {
  requirements: ListRequirement[];
  loading: boolean;
  onStatusChange: (id: string, newStatus: string) => Promise<void>;
  onEdit: (req: ListRequirement) => void;
  onDelete: (id: string, title: string) => Promise<void>;
  canDelete: boolean;
};

export function RequirementList({
  requirements,
  loading,
  onStatusChange,
  onEdit,
  onDelete,
  canDelete,
}: Props) {
  if (loading && requirements.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="material-symbols-outlined text-3xl text-muted-foreground animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  if (!loading && requirements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-2 text-muted-foreground">
        <span
          className="material-symbols-outlined text-4xl opacity-40"
          style={{ fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 40" }}
        >
          checklist
        </span>
        <p className="text-sm">No requirements found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 text-[11px] uppercase tracking-wide text-muted-foreground/60">
            <th className="text-left py-2 px-3 font-medium w-28">ID</th>
            <th className="text-left py-2 px-3 font-medium">Title</th>
            <th className="text-left py-2 px-3 font-medium w-28">Status</th>
            <th className="text-left py-2 px-3 font-medium w-24">Priority</th>
            <th className="text-left py-2 px-3 font-medium w-36">Assignee</th>
            <th className="text-left py-2 px-3 font-medium w-32">Labels</th>
            <th className="text-left py-2 px-3 font-medium w-20">Jira</th>
            <th className="py-2 px-3 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {requirements.map((req) => {
            const statusCfg = STATUS_CONFIG[req.status] ?? {
              label: req.status,
              className: "bg-gray-100 text-gray-600 hover:bg-gray-200",
            };
            const priorityCfg = PRIORITY_CONFIG[req.priority] ?? {
              label: req.priority,
              icon: "remove",
              className: "text-gray-500",
            };

            return (
              <tr key={req.id} className="group hover:bg-black/[0.02] transition-colors">
                <td className="py-2.5 px-3">
                  <Link href={`/requirements/${req.id}`}>
                    <span className="font-mono text-[11px] text-muted-foreground/70 hover:text-primary hover:underline cursor-pointer">
                      {req.requirement_id}
                    </span>
                  </Link>
                </td>

                <td className="py-2.5 px-3">
                  <button
                    onClick={() => onEdit(req)}
                    className="text-left font-medium hover:underline line-clamp-1 max-w-xs"
                  >
                    {req.title}
                  </button>
                  {req.project_name && (
                    <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                      {req.project_name}
                    </div>
                  )}
                </td>

                <td className="py-2.5 px-3">
                  {req.valid_transitions.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                          statusCfg.className
                        )}
                      >
                        {statusCfg.label}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="text-sm">
                        {req.valid_transitions.map((t) => (
                          <DropdownMenuItem
                            key={t}
                            onClick={() => onStatusChange(req.id, t)}
                          >
                            <span
                              className="material-symbols-outlined text-[14px] mr-2 text-muted-foreground"
                              style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 14" }}
                            >
                              arrow_forward
                            </span>
                            {TRANSITION_LABELS[t] ?? t}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        statusCfg.className
                      )}
                    >
                      {statusCfg.label}
                    </span>
                  )}
                </td>

                <td className="py-2.5 px-3">
                  <span
                    className={cn(
                      "flex items-center gap-0.5 text-[12px]",
                      priorityCfg.className
                    )}
                  >
                    <span
                      className="material-symbols-outlined text-[14px]"
                      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 14" }}
                    >
                      {priorityCfg.icon}
                    </span>
                    {priorityCfg.label}
                  </span>
                </td>

                <td className="py-2.5 px-3 text-[12px] text-muted-foreground">
                  {req.assignee_name ?? (
                    <span className="italic opacity-40">Unassigned</span>
                  )}
                </td>

                <td className="py-2.5 px-3">
                  <div className="flex flex-wrap gap-1">
                    {req.labels.map((label) => (
                      <span
                        key={label.id}
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: label.color }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                </td>

                <td className="py-2.5 px-3">
                  {req.jira_key && (
                    <span className="font-mono text-[11px] text-blue-600">{req.jira_key}</span>
                  )}
                </td>

                <td className="py-2.5 px-3">
                  {canDelete && (
                    <button
                      onClick={() => onDelete(req.id, req.title)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-destructive"
                    >
                      <span
                        className="material-symbols-outlined text-[16px]"
                        style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 16" }}
                      >
                        delete
                      </span>
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
