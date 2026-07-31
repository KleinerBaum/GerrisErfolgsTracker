import {
  PLANNING_NO_STORE_HEADERS,
  planningErrorResponse,
} from "../../../lib/planning-api";
import { planningReportForOwner } from "../../../lib/planning-server";
import { ownerEmail } from "../../../lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const owner = ownerEmail(request);
  if (!owner) {
    return Response.json(
      { error: "Anmeldung erforderlich." },
      { status: 401, headers: PLANNING_NO_STORE_HEADERS },
    );
  }
  try {
    return Response.json(
      { report: await planningReportForOwner(owner) },
      { headers: PLANNING_NO_STORE_HEADERS },
    );
  } catch (error) {
    return planningErrorResponse(error);
  }
}
