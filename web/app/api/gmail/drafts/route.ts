import {
  createGmailDraft,
  parseCreateGmailDraftInput,
} from "../../../../lib/google-gmail-server";
import {
  googleErrorResponse,
  GoogleValidationError,
  requireGoogleConnection,
  sameOrigin,
} from "../../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "cache-control": "private, no-store" };

async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new GoogleValidationError("Die E-Mail-Daten sind kein gültiges JSON.");
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json(
      {
        error: "Die Anfrage stammt nicht aus Gerris Kompass.",
        code: "forbidden_origin",
      },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "gmail",
    });
    const input = parseCreateGmailDraftInput(await requestJson(request));
    const draft = await createGmailDraft(connection, input);
    return Response.json(
      { ...draft, source: "gmail" },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return googleErrorResponse(error, "gmail");
  }
}
