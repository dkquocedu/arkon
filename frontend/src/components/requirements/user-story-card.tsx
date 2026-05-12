"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type UserStory = {
  id: string;
  story_id: string;
  ur_id: string;
  title: string;
  persona: string;
  goal: string;
  business_value: string;
  priority: string;
  estimate?: string;
  acceptance_criteria: string;
  invest_notes?: string;
  split_recommendation?: string;
  generated_by: string;
  created_at: string;
  updated_at: string;
};

const MOSCOW_CONFIG: Record<string, { label: string; className: string }> = {
  must: { label: "Must", className: "bg-red-100 text-red-700" },
  should: { label: "Should", className: "bg-amber-100 text-amber-700" },
  could: { label: "Could", className: "bg-blue-100 text-blue-700" },
  wont: { label: "Won't", className: "bg-gray-100 text-gray-500" },
};

type Props = {
  story: UserStory;
  onDelete?: (id: string) => void;
};

export function UserStoryCard({ story, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);

  const moscow = MOSCOW_CONFIG[story.priority] ?? { label: story.priority, className: "bg-gray-100 text-gray-600" };

  return (
    <div className="rounded-xl border border-border/50 bg-background/60 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none hover:bg-black/[0.02] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className="font-mono text-[11px] text-muted-foreground/60 bg-muted/40 rounded px-1.5 py-0.5">
            {story.story_id}
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", moscow.className)}>
            {moscow.label}
          </span>
          {story.estimate && (
            <span className="text-[11px] text-muted-foreground/50">{story.estimate}</span>
          )}
          {story.generated_by === "ai" && (
            <span className="text-[10px] text-violet-500/70 font-medium">AI</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{story.title}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete "${story.title}"?`)) onDelete(story.id);
              }}
              className="text-muted-foreground/30 hover:text-destructive transition-colors p-1"
            >
              <span
                className="material-symbols-outlined text-[15px]"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 15" }}
              >
                delete
              </span>
            </button>
          )}
          <span
            className="material-symbols-outlined text-[16px] text-muted-foreground/40 transition-transform"
            style={{
              fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 16",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            expand_more
          </span>
        </div>
      </div>

      {/* Narrative (always visible) */}
      <div className="px-4 pb-3 text-[12px] text-muted-foreground space-y-0.5">
        <p>
          <span className="font-medium text-foreground/70">As a</span> {story.persona}
        </p>
        <p>
          <span className="font-medium text-foreground/70">I want to</span> {story.goal}
        </p>
        <p>
          <span className="font-medium text-foreground/70">So that</span> {story.business_value}
        </p>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/40 px-4 py-4 space-y-4 bg-muted/20">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/50 font-medium mb-2">
              Acceptance Criteria
            </p>
            <pre className="text-[12px] leading-relaxed whitespace-pre-wrap font-sans text-foreground/80">
              {story.acceptance_criteria}
            </pre>
          </div>

          {story.invest_notes && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/50 font-medium mb-1">
                INVEST Notes
              </p>
              <p className="text-[12px] text-foreground/70">{story.invest_notes}</p>
            </div>
          )}

          {story.split_recommendation && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/50 font-medium mb-1">
                Split Recommendation
              </p>
              <p className="text-[12px] text-foreground/70">{story.split_recommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
