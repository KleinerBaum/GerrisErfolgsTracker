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
  const driveRootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  const siteRole =
    process.env.GERRIS_SITE_ROLE?.trim().toLocaleLowerCase("en-US") === "qa"
      ? "qa"
      : "production";
  const integrations = {
    ...DEFAULT_INTEGRATIONS,
    calendarId:
      process.env.GOOGLE_CALENDAR_ID?.trim() ||
      DEFAULT_INTEGRATIONS.calendarId,
    driveFolderUrl: driveRootId
      ? `https://drive.google.com/drive/folders/${encodeURIComponent(driveRootId)}`
      : DEFAULT_INTEGRATIONS.driveFolderUrl,
  };

  return (
    <LifeOsApp
      initialState={createDemoState(ownerName, siteRole)}
      integrations={integrations}
      siteRole={siteRole}
    />
  );
}
