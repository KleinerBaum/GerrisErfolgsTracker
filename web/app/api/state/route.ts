import { eq } from "drizzle-orm";

import { getDb } from "../../../db";
import { userStates } from "../../../db/schema";

export const dynamic = "force-dynamic";

const MAX_STATE_BYTES = 1_500_000;

function ownerEmail(request: Request): string | null {
  const authenticated = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (authenticated) return authenticated;

  const host = new URL(request.url).hostname;
  if (
    process.env.NODE_ENV !== "production" ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    return "lokale-vorschau@gerris-kompass";
  }
  return null;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
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
    return new Response(row.stateJson, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "private, no-store",
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

    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object") {
      return Response.json({ error: "Ungültiger Zustand." }, { status: 400 });
    }
    const state = payload as {
      schemaVersion?: unknown;
      revision?: unknown;
      tasks?: unknown;
      costs?: unknown;
      documents?: unknown;
    };
    if (
      state.schemaVersion !== 1 ||
      typeof state.revision !== "number" ||
      !Array.isArray(state.tasks) ||
      !Array.isArray(state.costs) ||
      !Array.isArray(state.documents)
    ) {
      return Response.json(
        { error: "Nicht unterstütztes Datenformat." },
        { status: 400 },
      );
    }

    const updatedAt = new Date().toISOString();
    await getDb()
      .insert(userStates)
      .values({
        ownerEmail: email,
        stateJson: raw,
        stateVersion: state.revision,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: userStates.ownerEmail,
        set: {
          stateJson: raw,
          stateVersion: state.revision,
          updatedAt,
        },
      });

    return Response.json({ ok: true, updatedAt });
  } catch (error) {
    return errorResponse(error);
  }
}
