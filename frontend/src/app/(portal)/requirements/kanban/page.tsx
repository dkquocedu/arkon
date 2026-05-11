"use client";

import { useCallback, useEffect, useTransition, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { KanbanBoard, type KanbanRequirement } from "@/components/requirements/kanban-board";

type KanbanCol = {
  status: string;
  label: string;
  items: KanbanRequirement[];
};

type KanbanResponse = {
  columns: KanbanCol[];
};

export default function KanbanPage() {
  const [requirements, setRequirements] = useState<KanbanRequirement[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      try {
        const data = await api<KanbanResponse>("/api/requirements/kanban");
        setRequirements(data.columns.flatMap((col) => col.items));
      } catch {
        setRequirements([]);
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kanban Board"
        description="Visual lifecycle view of all user requirements."
        action={
          <Link href="/requirements">
            <Button variant="outline" size="sm">
              <span
                className="material-symbols-outlined text-[15px] mr-1.5"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 15" }}
              >
                list
              </span>
              List View
            </Button>
          </Link>
        }
      />

      {isPending ? (
        <div className="flex items-center justify-center py-32">
          <span className="material-symbols-outlined text-3xl text-muted-foreground animate-spin">
            progress_activity
          </span>
        </div>
      ) : (
        <KanbanBoard requirements={requirements} onChanged={load} />
      )}
    </div>
  );
}
