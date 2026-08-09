import {
  createGerrisTask,
  deleteGerrisTask,
  listTasksAcrossGoogleLists,
  parseCreateTaskInput,
  saveTaskReminderMetadata,
} from "../../../lib/google-tasks-server";
import {
  createCalendarEvent,
  deleteCalendarEvent,
} from "../../../lib/google-calendar-server";
import {
  googleErrorResponse,
  GoogleApiError,
  GoogleValidationError,
  requireGoogleConnection,
  sameOrigin,
  type GoogleConnection,
} from "../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "tasks",
    });
    const result = await listTasksAcrossGoogleLists(connection);
    return Response.json(
      {
        ...result,
        source: "google-tasks",
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return googleErrorResponse(error, "tasks");
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Ungültiger Ursprung.", code: "invalid_origin" },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "tasks",
    });
    const payload = await request.json().catch(() => {
      throw new GoogleValidationError("Die Aufgabendaten sind kein gültiges JSON.");
    });
    const input = parseCreateTaskInput(payload);
    const result = await createGerrisTask(connection, input);
    let task = result.task;
    if (input.reminderAt) {
      let calendarConnection: GoogleConnection | null = null;
      let reminderEvent: { calendarId: string; eventId: string } | null = null;
      try {
        calendarConnection = await requireGoogleConnection(request, {
          capability: "calendar",
        });
        const start = new Date(input.reminderAt);
        const event = await createCalendarEvent(calendarConnection, {
          title: `Aufgabe: ${task.title}`,
          startAt: start.toISOString(),
          endAt: new Date(start.getTime() + 15 * 60_000).toISOString(),
          kind: "focus",
          note: [
            `Google-Tasks-Liste: ${task.taskListTitle}`,
            task.notes?.trim() || "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          private: true,
          reminderMinutes: 0,
          reminderMethods: ["email", "popup"],
          sourceType: "task",
          sourceId: task.id,
          sourceOccurrence: "reminder",
        });
        if (!event.calendarId || !event.googleEventId) {
          throw new GoogleApiError(
            "Google Kalender hat keine Erinnerungsverknüpfung geliefert.",
            502,
          );
        }
        reminderEvent = { calendarId: event.calendarId, eventId: event.googleEventId };
        task = await saveTaskReminderMetadata(connection, task, {
          reminderAt: input.reminderAt,
          calendarId: event.calendarId,
          eventId: event.googleEventId,
        });
      } catch (error) {
        let compensationFailed = false;
        if (reminderEvent && calendarConnection) {
          try {
            await deleteCalendarEvent(
              calendarConnection,
              reminderEvent.calendarId,
              reminderEvent.eventId,
            );
          } catch (cleanupError) {
            if (
              !(cleanupError instanceof GoogleApiError) ||
              cleanupError.status !== 404
            ) {
              compensationFailed = true;
            }
          }
        }
        if (result.created) {
          try {
            await deleteGerrisTask(
              connection,
              task.id,
              false,
              task.etag,
              task.taskListId,
            );
          } catch {
            compensationFailed = true;
          }
        }
        if (compensationFailed) {
          throw new GoogleApiError(
            "Die Aufgabe oder ihre Erinnerung konnte nach einem Teilfehler nicht vollständig zurückgerollt werden. Bitte prüfe Google Tasks und Google Kalender.",
            502,
            true,
          );
        }
        throw error;
      }
    }
    return Response.json(
      { task, created: result.created },
      {
        status: result.created ? 201 : 200,
        headers: { "cache-control": "private, no-store" },
      },
    );
  } catch (error) {
    return googleErrorResponse(error, "tasks");
  }
}
