import { headers } from "next/headers";

import { LifeOsApp } from "../components/life-os-app";
import {
  createDemoState,
  DEFAULT_INTEGRATIONS,
} from "../lib/demo-data";

export const dynamic = "force-dynamic";

function safeName(encoded: string | null, encoding: string | null): string {
  if (!encoded || encoding !== "percent-encoded-utf-8") return "Gerri";
  try {
    return decodeURIComponent(encoded).trim().split(/\s+/)[0] || "Gerri";
  } catch {
    return "Gerri";
  }
}

export default async function HomePage() {
  const requestHeaders = await headers();
  const ownerName = safeName(
    requestHeaders.get("oai-authenticated-user-full-name"),
    requestHeaders.get("oai-authenticated-user-full-name-encoding"),
  );
  const integrations = {
    calendarId:
      process.env.GOOGLE_CALENDAR_ID || DEFAULT_INTEGRATIONS.calendarId,
    calendarEmbedUrl:
      process.env.GOOGLE_CALENDAR_EMBED_URL ||
      DEFAULT_INTEGRATIONS.calendarEmbedUrl,
    driveFolderUrl:
      process.env.GOOGLE_DRIVE_FOLDER_URL ||
      DEFAULT_INTEGRATIONS.driveFolderUrl,
    driveLocalPath:
      process.env.GOOGLE_DRIVE_LOCAL_PATH ||
      DEFAULT_INTEGRATIONS.driveLocalPath,
    gmailAccount:
      process.env.GMAIL_ACCOUNT || DEFAULT_INTEGRATIONS.gmailAccount,
  };

  return (
    <LifeOsApp
      initialState={createDemoState(ownerName)}
      integrations={integrations}
    />
  );
}
