"use client";

import { localComplexityAssessment, normalizeAssessment } from "./gamification";
import type { ComplexityAssessment, Task } from "./types";

type AssessmentPayload = {
  result?: Partial<ComplexityAssessment>;
  mode?: "ai" | "fallback";
  error?: string;
};

export async function suggestTaskComplexity(task: Task): Promise<ComplexityAssessment> {
  const fallback = localComplexityAssessment(task);
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "gamification-assessment",
      taskId: task.id,
      title: task.title,
      area: task.area,
      quadrant: task.quadrant,
      estimateMinutes: task.estimateMinutes,
      assigned: Boolean(task.assigned),
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as AssessmentPayload;
  if (!response.ok || !payload.result) {
    throw new Error(payload.error || "Der KI-Vorschlag konnte nicht geladen werden.");
  }
  return normalizeAssessment(
    {
      ...payload.result,
      source: payload.mode === "ai" ? "AI" : "FALLBACK",
      suggestedAt: new Date().toISOString(),
    },
    fallback,
  );
}
