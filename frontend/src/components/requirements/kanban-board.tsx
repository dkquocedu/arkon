"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type URLabel = { id: string; name: string; color: string };

export type KanbanRequirement = {
  id: string;
  requirement_id: string;
  title: string;
  status: string;
  priority: string;
  assignee?: { id: string; full_name: string };
  project?: { id: string; name: string };
  labels: URLabel[];
  valid_transitions: string[];
};

const COLUMNS = [
  { key: "draft", label: "Draft", icon: "edit_note" },
  { key: "analysis", label: "Analysis", icon: "analytics" },
  { key: "approved", label: "Approved", icon: "check_circle" },
  { key: "dev_ready", label: "Dev Ready", icon: "code" },
  { key: "done", label: "Done", icon: "task_alt" },
  { key: "rejected", label: "Rejected", icon: "cancel" },
] as const;

const PRIORITY_CONFIG: Record<string, { icon: string; className: string }> = {
  critical: { icon: "priority_high", className: "text-red-500" },
  high: { icon: "keyboard_arrow_up", className: "text-orange-400" },
  medium: { icon: "remove", className: "text-yellow-500" },
  low: { icon: "keyboard_arrow_down", className: "text-green-500" },
};

const TRANSITION_LABELS: Record<string, string> = {
  draft: "Draft",
  analysis: "Analysis",
  approved: "Approved",
  dev_ready: "Dev Ready",
  done: "Done",
  rejected: "Rejected",
};

type Props = {
  requirements: KanbanRequirement[];
  onChanged: () => void;
};

export function KanbanBoard({ requirements, onChanged }: Props) {
  const [movingId, setMovingId] = useState<string | null>(null);

  const byStatus = COLUMNS.map((col) => ({
    ...col,
    items: requirements.filter((r) => r.status === col.key),
  }));

  const handleMove = async (reqId: string, newStatus: string) => {
    setMovingId(reqId);
    try {
      await api(`/api/requirements/${reqId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      onChanged();
    } catch (err) {
      alert("Move failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setMovingId(null);
    }
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {byStatus.map((col) => (
        <div key={col.key} className="flex-shrink-0 w-60 flex flex-col gap-2">
          {/* Column header */}
          <div className="flex items-center gap-1.5 px-1 py-1.5">
            <span
              className="material-symbols-outlined text-[15px] text-muted-foreground/60"
              style={{ fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 15" }}
            >
              {col.icon}
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {col.label}
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground/40 bg-black/[0.04] px-1.5 py-0.5 rounded-full">
              {col.items.length}
            </span>
          </div>

          {/* Cards */}
          <div className="flex flex-col gap-2">
            {col.items.length === 0 && (
              <div className="flex items-center justify-center py-8 rounded-lg border-2 border-dashed border-border/30 text-[12px] text-muted-foreground/30">
                Empty
              </div>
            )}

            {col.items.map((req) => {
              const priorityCfg = PRIORITY_CONFIG[req.priority] ?? {
                icon: "remove",
                className: "text-gray-400",
              };
              const isMoving = movingId === req.id;

              return (
                <div
                  key={req.id}
                  className={cn(
                    "bg-white rounded-lg border border-border/60 p-3 shadow-sm",
                    "hover:border-border hover:shadow transition-all duration-100",
                    isMoving && "opacity-50 pointer-events-none"
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[10px] text-muted-foreground/50">
                      {req.requirement_id}
                    </span>
                    <span
                      className={cn(
                        "material-symbols-outlined text-[13px]",
                        priorityCfg.className
                      )}
                      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 13" }}
                    >
                      {priorityCfg.icon}
                    </span>
                  </div>

                  <p className="text-[13px] font-medium leading-snug mb-2 line-clamp-3">
                    {req.title}
                  </p>

                  {req.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
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
                  )}

                  {req.assignee && (
                    <div className="flex items-center gap-1 mb-2">
                      <span
                        className="material-symbols-outlined text-[12px] text-muted-foreground/40"
                        style={{ fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 12" }}
                      >
                        person
                      </span>
                      <span className="text-[11px] text-muted-foreground/60 truncate">
                        {req.assignee.full_name}
                      </span>
                    </div>
                  )}

                  {req.valid_transitions.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2 border-t border-border/40">
                      {req.valid_transitions.map((t) => (
                        <button
                          key={t}
                          onClick={() => handleMove(req.id, t)}
                          disabled={isMoving}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-black/[0.04] text-muted-foreground hover:bg-black/[0.08] hover:text-foreground transition-colors disabled:opacity-40"
                        >
                          → {TRANSITION_LABELS[t] ?? t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
