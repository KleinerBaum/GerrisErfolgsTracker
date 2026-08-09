import { and, eq } from "drizzle-orm";

import { getDb } from "../../../db";
import { userStates } from "../../../db/schema";
import { ownerEmail, sameOrigin } from "../../../lib/server-auth";
import { isPersistedAppState } from "../../../lib/state-validation";

export const dynamic = "force-dynamic";

const MAX_STATE_BYTES = 1_500_000;

function revisionEtag(revision: number): string {
  return `"${revision}"`;
}

function expectedRevision(request: Request): number | null {
  const value = request.headers.get("if-match")?.trim();
  if (!value) return null;
  const match = /^(?:W\/)?"(\d+)"$/.exec(value);
  if (!match) return null;
  const revision = Number(match[1]);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function conflictResponse(currentRevision: number) {
  return Response.json(
    {
      error:
        "Der Zustand wurde in einer anderen Sitzung geändert. Bitte neu laden und die Änderungen bewusst zusammenführen.",
      code: "state_revision_conflict",
      currentRevision,
    },
    {
      status: 409,
      headers: {
        "cache-control": "private, no-store",
        etag: revisionEtag(currentRevision),
      },
    },
  );
}

function corruptStateResponse() {
  return Response.json(
    {
      error:
        "Der private Zustand ist beschädigt. Automatischer Abgleich und Planung bleiben bis zur Wiederherstellung blockiert.",
      code: "state_storage_corrupt",
      fallback: "local",
    },
    {
      status: 503,
      headers: { "cache-control": "private, no-store" },
    },
  );
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const storageUnavailable =
    message.includes("D1-Binding") ||
    message.includes("no such table") ||
    message.includes("user_states");
  return Response.json(
    {
      error: storageUnavailable
        ? "Der private Online-Speicher wird gerade vorbereitet."
        : "Der Zustand konnte nicht verarbeitet werden.",
      fallback: "local",
    },
    { status: storageUnavailable ? 503 : 500 },
  );
}

export async function GET(request: Request) {
  const email = ownerEmail(request);
  if (!email) {
    return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  }

  try {
    const [row] = await getDb()
      .select()
      .from(userStates)
      .where(eq(userStates.ownerEmail, email))
      .limit(1);

    if (!row) return new Response(null, { status: 204 });
    let payload: unknown;
    try {
      payload = JSON.parse(row.stateJson);
    } catch {
      return corruptStateResponse();
    }
    if (!isPersistedAppState(payload) || payload.revision !== row.stateVersion) return corruptStateResponse();
    return new Response(JSON.stringify(payload), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "private, no-store",
        etag: revisionEtag(row.stateVersion),
        "x-gerris-state-revision": String(row.stateVersion),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  const email = ownerEmail(request);
  if (!email) {
    return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return Response.json({ error: "Ungültiger Ursprung." }, { status: 403 });
  }

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_STATE_BYTES) {
      return Response.json(
        { error: "Der gespeicherte Zustand ist zu groß." },
        { status: 413 },
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return Response.json(
        { error: "Ungültiger Zustand." },
        { status: 400 },
      );
    }
    if (!isPersistedAppState(payload)) {
      return Response.json(
        { error: "Nicht unterstütztes Datenformat." },
        { status: 400 },
      );
    }
    const state = payload;

    const persistedPayload = {
      ...payload,
      tasks: state.tasks.filter((task) => !task.taskListId),
    };
    const stateJson = JSON.stringify(persistedPayload);
    const updatedAt = new Date().toISOString();
    const db = getDb();
    const [current] = await db
      .select({ stateVersion: userStates.stateVersion })
      .from(userStates)
      .where(eq(userStates.ownerEmail, email))
      .limit(1);
    const expected = expectedRevision(request);
    if (current) {
      if (
        expected === null ||
        expected !== current.stateVersion ||
        state.revision <= current.stateVersion
      ) {
        return conflictResponse(current.stateVersion);
      }
      const updated = await db
        .update(userStates)
        .set({ stateJson, stateVersion: state.revision, updatedAt })
        .where(
          and(
            eq(userStates.ownerEmail, email),
            eq(userStates.stateVersion, expected),
          ),
        )
        .returning({ stateVersion: userStates.stateVersion });
      if (!updated[0]) return conflictResponse(current.stateVersion);
    } else {
      if (expected !== null && expected !== 0) return conflictResponse(0);
      const inserted = await db
        .insert(userStates)
        .values({
          ownerEmail: email,
          stateJson,
          stateVersion: state.revision,
          updatedAt,
        })
        .onConflictDoNothing()
        .returning({ stateVersion: userStates.stateVersion });
      if (!inserted[0]) {
        const [winner] = await db
          .select({ stateVersion: userStates.stateVersion })
          .from(userStates)
          .where(eq(userStates.ownerEmail, email))
          .limit(1);
        return conflictResponse(winner?.stateVersion ?? 0);
      }
    }

    return Response.json(
      { ok: true, updatedAt, revision: state.revision },
      {
        headers: {
          etag: revisionEtag(state.revision),
          "cache-control": "private, no-store",
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
