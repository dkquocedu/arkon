"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequirementList, type ListRequirement } from "@/components/requirements/requirement-list";
import { RequirementDialog } from "@/components/requirements/requirement-dialog";

export default function RequirementsPage() {
  const { canAccess } = useAuth();
  const [requirements, setRequirements] = useState<ListRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<ListRequirement | null>(null);

  const loadRequirements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      params.set("limit", "200");
      const data = await api<ListRequirement[]>(`/api/requirements?${params.toString()}`);
      setRequirements(data);
    } catch {
      setRequirements([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, priorityFilter]);

  useEffect(() => {
    const t = setTimeout(loadRequirements, 200);
    return () => clearTimeout(t);
  }, [loadRequirements]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api(`/api/requirements/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      loadRequirements();
    } catch (err) {
      alert("Status update failed: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      await api(`/api/requirements/${id}`, { method: "DELETE" });
      loadRequirements();
    } catch (err) {
      alert("Delete failed: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const openCreate = () => {
    setEditingReq(null);
    setDialogOpen(true);
  };

  const openEdit = (req: ListRequirement) => {
    setEditingReq(req);
    setDialogOpen(true);
  };

  const hasFilters = !!(search || statusFilter || priorityFilter);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Requirements"
        description={`${requirements.length} user requirement${requirements.length !== 1 ? "s" : ""}`}
        action={
          <div className="flex items-center gap-2">
            <Link href="/requirements/kanban">
              <Button variant="outline" size="sm">
                <span
                  className="material-symbols-outlined text-[15px] mr-1.5"
                  style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 15" }}
                >
                  view_kanban
                </span>
                Kanban
              </Button>
            </Link>
            <Button size="sm" onClick={openCreate}>
              <span
                className="material-symbols-outlined text-[15px] mr-1.5"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 15" }}
              >
                add
              </span>
              New
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-72">
          <span
            className="absolute left-2.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[15px] text-muted-foreground/50"
            style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 15" }}
          >
            search
          </span>
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search requirements…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="analysis">Analysis</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="dev_ready">Dev Ready</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-32 h-8 text-sm">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setPriorityFilter("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="bg-background/40 rounded-2xl border border-border/50 overflow-hidden">
        <RequirementList
          requirements={requirements}
          loading={loading}
          onStatusChange={handleStatusChange}
          onEdit={openEdit}
          onDelete={handleDelete}
          canDelete={canAccess("requirement", "delete")}
        />
      </div>

      <RequirementDialog
        requirement={editingReq}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={loadRequirements}
      />
    </div>
  );
}
