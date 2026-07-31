import {
  PLANNING_NO_STORE_HEADERS,
  planningErrorResponse,
} from "../../../../lib/planning-api";
import { saveJournalSuggestions } from "../../../../lib/planning-store";
import { ownerEmail, sameOrigin } from "../../../../lib/server-auth";
import type { JournalAnalysisSuggestion } from "../../../../lib/types";

export const dynamic = "force-dynamic";

function validSuggestion(value: unknown): value is JournalAnalysisSuggestion {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<JournalAnalysisSuggestion>;
  return (
    (item.kind === "decision" ||
      item.kind === "next_step" ||
      item.kind === "waiting" ||
      item.kind === "calendar") &&
    typeof item.title === "string" &&
    typeof item.detail === "string" &&
    typeof item.evidence === "string" &&
    typeof item.confidence === "number" &&
    typeof item.proposedNextStep === "string" &&
    (item.proposedDueAt === null || typeof item.proposedDueAt === "string") &&
    typeof item.requiresCalendarTarget === "boolean"
  );
}

export async function POST(request: Request) {
  const owner = ownerEmail(request);
  if (!owner) {
    return Response.json(
      { error: "Anmeldung erforderlich." },
      { status: 401, headers: PLANNING_NO_STORE_HEADERS },
    );
  }
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Ungültiger Ursprung." },
      { status: 403, headers: PLANNING_NO_STORE_HEADERS },
    );
  }
  try {
    const payload = (await request.json()) as {
      journalId?: unknown;
      suggestions?: unknown;
    };
    if (
      typeof payload.journalId !== "string" ||
      !payload.journalId.trim() ||
      payload.journalId.length > 512 ||
      !Array.isArray(payload.suggestions) ||
      !payload.suggestions.every(validSuggestion)
    ) {
      throw new Error("Die Tagebuchvorschläge sind ungültig.");
    }
    const topics = await saveJournalSuggestions(
      owner,
      payload.journalId,
      payload.suggestions,
    );
    return Response.json({ topics }, { headers: PLANNING_NO_STORE_HEADERS });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
