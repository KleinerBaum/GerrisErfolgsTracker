import {
  canonicalizeResearchUrl,
  normalizeJobResearchPayload,
  publicJobUrl,
  researchOpenAIRequest,
  validResearchJobSource,
} from "../../../lib/job-research";
import { ownerEmail, ownerHash, sameOrigin } from "../../../lib/server-auth";
import type {
  ApplicationResearchScope,
  JobResearchSource,
} from "../../../lib/types";

export const dynamic = "force-dynamic";

const OPENAI_URL = `${
  process.env.OPENAI_BASE_URL?.replace(/\/$/, "") ??
  "https://api.openai.com/v1"
}/responses`;
const OPENAI_START_TIMEOUT_MS = 30_000;
const OPENAI_POLL_TIMEOUT_MS = 20_000;
const OPENAI_RESEARCH_MAX_ATTEMPTS = 2;
const RESEARCH_JOB_LIFETIME_MS = 9 * 60_000;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_REQUESTS = 6;
const requestTimes = new Map<string, number[]>();
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);
const RESEARCH_SCOPES = new Set<ApplicationResearchScope>([
  "job_posting",
  "company",
  "department",
  "projects",
  "publications",
  "salary",
]);
const RESEARCH_SCOPE_LABELS: Record<ApplicationResearchScope, string> = {
  job_posting: "Stellenanzeige mit Aufgaben, Anforderungen und Auswahlprozess",
  company: "Unternehmen und aktuelle offizielle Entwicklungen",
  department: "Abteilung und organisatorisches Umfeld",
  projects: "rollenrelevante aktuelle Projekte und Initiativen",
  publications: "relevante offizielle Publikationen und Fachbeiträge",
  salary: "veröffentlichte Vergütung, Tarif oder belegter Gehaltskorridor",
};

type OpenAIResearchPayload = {
  id?: unknown;
  model?: unknown;
  status?: unknown;
  error?: { code?: unknown };
  incomplete_details?: { reason?: unknown };
  output_text?: unknown;
  output?: Array<{
    type?: unknown;
    action?: {
      sources?: Array<{ url?: unknown; title?: unknown }>;
    };
    content?: Array<{
      type?: unknown;
      text?: unknown;
      refusal?: unknown;
      annotations?: Array<{
        type?: unknown;
        url?: unknown;
        title?: unknown;
      }>;
    }>;
  }>;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
  };
};

type ResearchJobState = {
  version: 1;
  responseId: string;
  owner: string;
  requestedUrl: string;
  researchedAt: string;
  model: string;
  providedAdText: boolean;
  expiresAt: number;
};

type ResearchJobReference = {
  id: string;
  token: string;
  status: string;
  startedAt: string;
};

type OpenAIErrorPayload = {
  error?: {
    code?: unknown;
    type?: unknown;
    param?: unknown;
  };
};

class ResearchRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function clipped(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function redactObviousCredentials(value: string): string {
  return value
    .replace(
      /-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/gi,
      "[PRIVATER SCHLÜSSEL ENTFERNT]",
    )
    .replace(/\bsk-[a-z0-9_-]{16,}\b/gi, "[API-SCHLÜSSEL ENTFERNT]")
    .replace(/\bBearer\s+[a-z0-9._~+\/-]{12,}=*/gi, "Bearer [TOKEN ENTFERNT]")
    .replace(
      /\b(passwort|password|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret)\b\s*[:=]\s*[^\s,;]+/gi,
      (_match, label: string) => `${label}: [ENTFERNT]`,
    );
}

function outputText(payload: OpenAIResearchPayload): string | null {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal" && typeof content.refusal === "string") {
        throw new Error("Die öffentliche Recherche konnte nicht verarbeitet werden.");
      }
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function researchSources(payload: OpenAIResearchPayload): JobResearchSource[] {
  const sources = new Map<string, JobResearchSource>();
  const add = (
    rawUrl: unknown,
    rawTitle: unknown,
    discoveredBy: "consulted" | "citation",
  ) => {
    const url = canonicalizeResearchUrl(rawUrl);
    if (!url) return;
    const current = sources.get(url);
    const title = clipped(rawTitle, 500) || new URL(url).hostname;
    sources.set(url, {
      url,
      title: current?.title || title,
      domain: new URL(url).hostname,
      discoveredBy:
        current && current.discoveredBy !== discoveredBy
          ? "both"
          : current?.discoveredBy || discoveredBy,
    });
  };

  for (const item of payload.output ?? []) {
    if (item.type === "web_search_call") {
      for (const source of item.action?.sources ?? []) {
        add(source.url, source.title, "consulted");
      }
    }
    if (item.type === "message") {
      for (const content of item.content ?? []) {
        for (const annotation of content.annotations ?? []) {
          if (annotation.type === "url_citation") {
            add(annotation.url, annotation.title, "citation");
          }
        }
      }
    }
  }
  return [...sources.values()];
}

function rateLimit(owner: string): number | null {
  const now = Date.now();
  const recent = (requestTimes.get(owner) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT_REQUESTS) {
    requestTimes.set(owner, recent);
    const oldest = recent[0] ?? now;
    return Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1_000));
  }
  recent.push(now);
  requestTimes.set(owner, recent);
  return null;
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchResearchStart(body: string, apiKey: string): Promise<Response> {
  const idempotencyKey = crypto.randomUUID();
  for (let attempt = 0; attempt < OPENAI_RESEARCH_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_START_TIMEOUT_MS);
    try {
      const response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body,
        signal: controller.signal,
      });
      if (
        response.ok ||
        !RETRYABLE_STATUSES.has(response.status) ||
        attempt === OPENAI_RESEARCH_MAX_ATTEMPTS - 1
      ) {
        return response;
      }
      await response.arrayBuffer();
      await wait(Math.min(750 * 2 ** attempt, 3_000));
    } catch (error) {
      if (attempt === OPENAI_RESEARCH_MAX_ATTEMPTS - 1) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new ResearchRequestError(
            "Die Vakanzrecherche konnte nicht rechtzeitig gestartet werden.",
            503,
          );
        }
        throw error;
      }
      await wait(Math.min(750 * 2 ** attempt, 3_000));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Die Vakanzrecherche ist vorübergehend nicht erreichbar.");
}

async function fetchResearchStatus(
  responseId: string,
  apiKey: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_POLL_TIMEOUT_MS);
  try {
    const url = new URL(`${OPENAI_URL}/${encodeURIComponent(responseId)}`);
    url.searchParams.append("include[]", "web_search_call.action.sources");
    return await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hmacKey(apiKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function createJobToken(
  state: ResearchJobState,
  apiKey: string,
): Promise<string> {
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(state)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(apiKey),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyJobToken(
  token: unknown,
  apiKey: string,
  expectedOwner: string,
): Promise<ResearchJobState | null> {
  if (typeof token !== "string" || token.length > 4_000) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const [payload, signature] = parts;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(apiKey),
      base64UrlDecode(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payload)),
    );
    if (!parsed || typeof parsed !== "object") return null;
    const state = parsed as Partial<ResearchJobState>;
    if (
      state.version !== 1 ||
      typeof state.responseId !== "string" ||
      !/^resp_[a-z0-9_-]+$/i.test(state.responseId) ||
      state.owner !== expectedOwner ||
      !validResearchJobSource(state.requestedUrl, state.providedAdText) ||
      typeof state.researchedAt !== "string" ||
      !Number.isFinite(Date.parse(state.researchedAt)) ||
      typeof state.model !== "string" ||
      !state.model ||
      typeof state.expiresAt !== "number" ||
      state.expiresAt < Date.now()
    ) {
      return null;
    }
    return state as ResearchJobState;
  } catch {
    return null;
  }
}

function clientJob(
  state: ResearchJobState,
  token: string,
  status: unknown,
): ResearchJobReference {
  return {
    id: state.responseId,
    token,
    status: typeof status === "string" ? status : "in_progress",
    startedAt: state.researchedAt,
  };
}

function pendingJobResponse(
  state: ResearchJobState,
  token: string,
  status: unknown = "in_progress",
  retryAfter = 3,
): Response {
  return Response.json(
    { job: clientJob(state, token, status) },
    {
      status: 202,
      headers: {
        "cache-control": "private, no-store",
        "retry-after": String(retryAfter),
      },
    },
  );
}

function completedResearch(
  payload: OpenAIResearchPayload,
  state: ResearchJobState,
) {
  const raw = outputText(payload);
  if (!raw) {
    throw new ResearchRequestError(
      "Die Vakanzrecherche hat kein Ergebnis geliefert.",
      503,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ResearchRequestError(
      "Die Vakanzrecherche hat kein gültiges Ergebnis geliefert.",
      503,
    );
  }
  const inputTokens =
    typeof payload.usage?.input_tokens === "number"
      ? payload.usage.input_tokens
      : 0;
  const outputTokens =
    typeof payload.usage?.output_tokens === "number"
      ? payload.usage.output_tokens
      : 0;
  const result = normalizeJobResearchPayload(parsed, {
    requestedUrl: state.requestedUrl,
    sources: researchSources(payload),
    researchedAt: state.researchedAt,
    model:
      typeof payload.model === "string" && payload.model
        ? payload.model
        : state.model,
    responseId: state.responseId,
    providedAdText: state.providedAdText,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens:
        typeof payload.usage?.total_tokens === "number"
          ? payload.usage.total_tokens
          : inputTokens + outputTokens,
      webSearchCalls: (payload.output ?? []).filter(
        (item) => item.type === "web_search_call",
      ).length,
    },
  });
  if (
    !state.providedAdText &&
    result.retrievalStatus !== "exact_page_accessed"
  ) {
    throw new ResearchRequestError(
      "Die Stellenanzeige war nicht zuverlässig auffindbar. Bitte füge den vollständigen Anzeigentext ein.",
      422,
    );
  }
  return result;
}

function terminalFailureMessage(payload: OpenAIResearchPayload): string {
  const reason = clipped(payload.incomplete_details?.reason, 100);
  if (reason === "max_output_tokens") {
    return "Die Vakanzrecherche hat das Ausgabelimit erreicht. Bitte erneut starten.";
  }
  if (reason === "content_filter") {
    return "Die Vakanzrecherche konnte aus Sicherheitsgründen nicht abgeschlossen werden.";
  }
  const code = clipped(payload.error?.code, 100).replace(/[^a-z0-9_-]/gi, "");
  const detail = [clipped(payload.status, 40), reason || code]
    .filter(Boolean)
    .join("/");
  return detail
    ? `Die Vakanzrecherche wurde nicht vollständig abgeschlossen (${detail}).`
    : "Die Vakanzrecherche wurde nicht vollständig abgeschlossen.";
}

async function openAIErrorSuffix(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as OpenAIErrorPayload;
    return [payload.error?.code, payload.error?.type, payload.error?.param]
      .map((value) => clipped(value, 100).replace(/[^a-z0-9_.\[\]-]/gi, ""))
      .filter(Boolean)
      .join("/");
  } catch {
    return "";
  }
}

async function pollResearchJob(
  candidate: Record<string, unknown>,
  owner: string,
  apiKey: string,
): Promise<Response> {
  const job = candidate.job;
  if (!job || typeof job !== "object") {
    throw new ResearchRequestError("Der Rechercheauftrag ist ungültig.", 400);
  }
  const reference = job as Record<string, unknown>;
  const state = await verifyJobToken(reference.token, apiKey, owner);
  if (!state || reference.id !== state.responseId) {
    throw new ResearchRequestError(
      "Der Rechercheauftrag ist ungültig oder abgelaufen.",
      400,
    );
  }
  let response: Response;
  try {
    response = await fetchResearchStatus(state.responseId, apiKey);
  } catch {
    return pendingJobResponse(
      state,
      String(reference.token),
      "in_progress",
      5,
    );
  }
  if (response.status === 404) {
    throw new ResearchRequestError(
      "Das Rechercheergebnis ist nicht mehr verfügbar. Bitte neu starten.",
      410,
    );
  }
  if (RETRYABLE_STATUSES.has(response.status)) {
    await response.arrayBuffer();
    return pendingJobResponse(
      state,
      String(reference.token),
      "in_progress",
      5,
    );
  }
  if (!response.ok) {
    const detail = await openAIErrorSuffix(response);
    throw new ResearchRequestError(
      `Vakanzrecherche nicht verfügbar (${response.status}${
        detail ? `; ${detail}` : ""
      }).`,
      503,
    );
  }
  const payload = (await response.json()) as OpenAIResearchPayload;
  if (payload.status === "queued" || payload.status === "in_progress") {
    return pendingJobResponse(
      state,
      String(reference.token),
      payload.status,
    );
  }
  if (payload.status !== "completed") {
    throw new ResearchRequestError(
      terminalFailureMessage(payload),
      503,
    );
  }
  return Response.json(
    { result: completedResearch(payload, state) },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const email = ownerEmail(request);
  if (!email) {
    return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return Response.json({ error: "Ungültiger Ursprung." }, { status: 403 });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new ResearchRequestError(
        "Die Vakanzrecherche ist noch nicht konfiguriert.",
        503,
      );
    }
    const owner = await ownerHash(email);
    const input: unknown = await request.json();
    if (!input || typeof input !== "object") {
      throw new ResearchRequestError("Die Rechercheanfrage ist ungültig.", 400);
    }
    const candidate = input as Record<string, unknown>;
    if (candidate.job) {
      return await pollResearchJob(candidate, owner, apiKey);
    }
    const companyName = clipped(candidate.companyName, 300);
    const roleTitle = clipped(candidate.roleTitle, 300);
    const jobPostingText = redactObviousCredentials(
      clipped(candidate.jobPostingText, 30_000),
    );
    const requestedUrl = publicJobUrl(candidate.url);
    if (!requestedUrl && !jobPostingText) {
      throw new ResearchRequestError(
        "Bitte eine öffentliche Stellen-URL angeben oder den vollständigen Anzeigentext einfügen.",
        400,
      );
    }
    const retryAfter = rateLimit(owner);
    if (retryAfter !== null) {
      return Response.json(
        { error: "Bitte warte kurz, bevor du eine weitere Vakanz recherchierst." },
        { status: 429, headers: { "retry-after": String(retryAfter) } },
      );
    }
    const researchScopes = Array.isArray(candidate.researchScopes)
      ? candidate.researchScopes
          .filter(
            (scope): scope is ApplicationResearchScope =>
              typeof scope === "string" &&
              RESEARCH_SCOPES.has(scope as ApplicationResearchScope),
          )
          .slice(0, RESEARCH_SCOPES.size)
      : ["job_posting", "company"] satisfies ApplicationResearchScope[];
    const researchedAt = new Date().toISOString();
    const model =
      process.env.OPENAI_RESEARCH_MODEL?.trim() || "gpt-5.6-luna";
    const prompt = [
      `Recherchezeitpunkt: ${researchedAt}`,
      `Exakte Stellen-URL: ${requestedUrl || "nicht angegeben"}`,
      `Vom Nutzer eingegebener Arbeitgeberhinweis, noch nicht verifiziert: ${companyName || "nicht angegeben"}`,
      `Vom Nutzer eingegebener Rollenhinweis, noch nicht verifiziert: ${roleTitle || "nicht angegeben"}`,
      "Zielmarkt: Deutschland",
      "Ausgabesprache: Deutsch",
      `Vom Nutzer gewählter Rechercheumfang: ${researchScopes
        .map((scope) => RESEARCH_SCOPE_LABELS[scope])
        .join("; ") || "keine externe Anreicherung; nur Zugänglichkeit der Anzeige prüfen"}`,
      "Recherchiere nur innerhalb dieses gewählten Umfangs. Nicht ausgewählte Themen bleiben als offene, nicht recherchierte Punkte sichtbar.",
      jobPostingText
        ? `Vom Nutzer als öffentlich gekennzeichneter Ausschreibungstext:\n<job_posting_text>\n${jobPostingText}\n</job_posting_text>`
        : "Kein zusätzlicher Ausschreibungstext bereitgestellt.",
      jobPostingText
        ? "Nutze keine Websuche für Anzeigenfakten; recherchiere nur knappe offizielle Unternehmensfakten."
        : "Verwende höchstens eine Suche für die konkrete Anzeige, eine für die offizielle Unternehmensquelle und nur bei Bedarf eine dritte Fallback-Suche.",
    ].join("\n\n");

    const response = await fetchResearchStart(
      JSON.stringify(
        researchOpenAIRequest({
          model,
          owner,
          prompt,
          providedAdText: Boolean(jobPostingText),
        }),
      ),
      apiKey,
    );
    if (!response.ok) {
      throw new ResearchRequestError(
        `Vakanzrecherche nicht verfügbar (${response.status}).`,
        503,
      );
    }
    const payload = (await response.json()) as OpenAIResearchPayload;
    if (typeof payload.id !== "string" || !/^resp_[a-z0-9_-]+$/i.test(payload.id)) {
      throw new ResearchRequestError(
        "Die Vakanzrecherche konnte nicht gestartet werden.",
        503,
      );
    }
    const state: ResearchJobState = {
      version: 1,
      responseId: payload.id,
      owner,
      requestedUrl: requestedUrl ?? "",
      researchedAt,
      model:
        typeof payload.model === "string" && payload.model
          ? payload.model
          : model,
      providedAdText: Boolean(jobPostingText),
      expiresAt: Date.now() + RESEARCH_JOB_LIFETIME_MS,
    };
    if (payload.status === "completed") {
      return Response.json(
        { result: completedResearch(payload, state) },
        { headers: { "cache-control": "private, no-store" } },
      );
    }
    if (payload.status !== "queued" && payload.status !== "in_progress") {
      throw new ResearchRequestError(
        "Die Vakanzrecherche wurde nicht gestartet.",
        503,
      );
    }
    const token = await createJobToken(state, apiKey);
    return pendingJobResponse(state, token, payload.status);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Die Vakanzrecherche konnte nicht abgeschlossen werden.";
    const status =
      error instanceof ResearchRequestError ? error.status : 503;
    return Response.json(
      { error: message },
      { status, headers: { "cache-control": "private, no-store" } },
    );
  }
}
