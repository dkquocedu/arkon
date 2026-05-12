"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { UserStoryCard, type UserStory } from "./user-story-card";

type Props = {
  urId: string;
  urStatus: string;
};

const GENERATE_ALLOWED = new Set(["approved", "dev_ready", "done"]);

export function UserStoryPanel({ urId, urStatus }: Props) {
  const [stories, setStories] = useState<UserStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<UserStory[]>(`/api/requirements/${urId}/user-stories`)
      .then((data) => { if (active) setStories(data); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Failed to load stories"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [urId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const newStories = await api<UserStory[]>(
        `/api/requirements/${urId}/user-stories/generate`,
        { method: "POST" },
      );
      setStories((prev) => [...prev, ...newStories]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (storyId: string) => {
    try {
      await api(`/api/user-stories/${storyId}`, { method: "DELETE" });
      setStories((prev) => prev.filter((s) => s.id !== storyId));
    } catch (e) {
      alert("Delete failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const canGenerate = GENERATE_ALLOWED.has(urStatus);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          User Stories
          {stories.length > 0 && (
            <span className="ml-2 text-[12px] font-normal text-muted-foreground/60">
              ({stories.length})
            </span>
          )}
        </h2>
        {canGenerate && (
          <Button size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <span className="material-symbols-outlined text-[15px] mr-1.5 animate-spin">
                  progress_activity
                </span>
                Generating…
              </>
            ) : (
              <>
                <span
                  className="material-symbols-outlined text-[15px] mr-1.5"
                  style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 15" }}
                >
                  auto_awesome
                </span>
                Generate User Stories
              </>
            )}
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="material-symbols-outlined text-3xl text-muted-foreground animate-spin">
            progress_activity
          </span>
        </div>
      ) : stories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
          <span
            className="material-symbols-outlined text-4xl opacity-30"
            style={{ fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 40" }}
          >
            fact_check
          </span>
          <p className="text-sm">No user stories yet.</p>
          {canGenerate && (
            <p className="text-xs opacity-60">Click \"Generate User Stories\" to create them with AI.</p>
          )}
          {!canGenerate && (
            <p className="text-xs opacity-60">Approve this requirement to unlock AI story generation.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {stories.map((story) => (
            <UserStoryCard key={story.id} story={story} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
