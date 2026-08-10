import assert from "node:assert/strict";
import test from "node:test";

import {
  applicationGenerationStartPayload,
  isApplicationMasterCvReady,
} from "../lib/application-generation-api.ts";
import {
  APPLICATION_MASTER_CV_CONTENT_TYPE,
  APPLICATION_MASTER_CV_MAX_BYTES,
  ApplicationMasterCvReferenceError,
  resolveApplicationMasterCv,
} from "../lib/server/application-master-cv.ts";
import { masterCvFixture } from "./fixtures/application-fixtures.mjs";

const documentId = "upload-11111111-1111-4111-8111-111111111111";
const fileId = documentId.slice("upload-".length);
const ownerHash = "owner-a";
const fingerprint = "sha256:stored-master-cv";
const editRevision = 3;

function stateFixture() {
  return {
    documents: [
      {
        id: documentId,
        name: "Master-CV.docx",
        storage: "upload",
        contentType: APPLICATION_MASTER_CV_CONTENT_TYPE,
        sizeBytes: APPLICATION_MASTER_CV_MAX_BYTES,
      },
    ],
    masterCvDocumentId: documentId,
    masterCvContent: {
      ...structuredClone(masterCvFixture),
      sourceDocumentId: documentId,
      sourceFingerprint: fingerprint,
      editRevision,
    },
  };
}

function resolver(state = stateFixture()) {
  return {
    requestedFileIds: [],
    async loadState() {
      return structuredClone(state);
    },
    async headObject(requestedFileId) {
      this.requestedFileIds.push(requestedFileId);
      return {
        size: APPLICATION_MASTER_CV_MAX_BYTES,
        httpMetadata: { contentType: APPLICATION_MASTER_CV_CONTENT_TYPE },
        customMetadata: { owner: ownerHash },
      };
    },
  };
}

test("löst den gespeicherten Master-CV owner-gebunden auf, ohne Binärdaten zu lesen", async () => {
  const storage = resolver();
  const result = await resolveApplicationMasterCv(
    { documentId, fingerprint, editRevision, ownerHash },
    storage,
  );

  assert.equal(result.sourceDocumentId, documentId);
  assert.deepEqual(storage.requestedFileIds, [fileId]);
});

test("liefert für fehlende und fremde Referenzen dieselbe 404-Antwort", async () => {
  const messages = [];
  for (const candidate of [
    { ...stateFixture(), masterCvDocumentId: "upload-22222222-2222-4222-8222-222222222222" },
    null,
  ]) {
    await assert.rejects(
      () =>
        resolveApplicationMasterCv(
          { documentId, fingerprint, editRevision, ownerHash },
          resolver(candidate),
        ),
      (error) => {
        assert.ok(error instanceof ApplicationMasterCvReferenceError);
        assert.equal(error.status, 404);
        messages.push(error.message);
        return true;
      },
    );
  }
  assert.equal(new Set(messages).size, 1);
});

test("meldet einen geänderten Fingerprint als Konflikt", async () => {
  await assert.rejects(
    () =>
      resolveApplicationMasterCv(
        {
          documentId,
          fingerprint: "sha256:stale",
          editRevision,
          ownerHash,
        },
        resolver(),
      ),
    (error) =>
      error instanceof ApplicationMasterCvReferenceError && error.status === 409,
  );
});

test("meldet eine echte Bearbeitungsrevision trotz gleichem Quell-Fingerprint als Konflikt", async () => {
  await assert.rejects(
    () =>
      resolveApplicationMasterCv(
        { documentId, fingerprint, editRevision: editRevision - 1, ownerHash },
        resolver(),
      ),
    (error) =>
      error instanceof ApplicationMasterCvReferenceError && error.status === 409,
  );
});

test("meldet eine verwaiste Datei auch mit altem Fingerprint nur als nicht gefunden", async () => {
  const storage = resolver();
  storage.headObject = async () => null;

  await assert.rejects(
    () =>
      resolveApplicationMasterCv(
        {
          documentId,
          fingerprint: "sha256:stale",
          editRevision,
          ownerHash,
        },
        storage,
      ),
    (error) =>
      error instanceof ApplicationMasterCvReferenceError && error.status === 404,
  );
});

test("der Startrequest bleibt auch bei einem synthetischen 16-MB-CV klein und binärfrei", () => {
  const payload = applicationGenerationStartPayload(
    {
      jobText: "Kurze Stellenbeschreibung",
      generationRequestId: "application-request-0001",
      documentDesignContext: JSON.stringify({
        selectionConfirmedAt: "2026-08-10T08:05:00.000Z",
        documents: [
          { kind: "tailored-cv", presetId: "gerris", layout: "gerris", customTemplateLayout: null },
          { kind: "cover-letter", presetId: "gerris", layout: "gerris", customTemplateLayout: null },
        ],
        visualizationsEnabled: false,
        visualizations: [],
      }),
    },
    {
      masterCvDocumentId: documentId,
      masterCvFingerprint: fingerprint,
      masterCvEditRevision: editRevision,
    },
  );
  const serialized = JSON.stringify(payload);

  assert.equal(APPLICATION_MASTER_CV_MAX_BYTES, 16 * 1024 * 1024);
  assert.ok(Buffer.byteLength(serialized) < 2_000);
  assert.equal(payload.masterCvDocumentId, documentId);
  assert.equal(payload.masterCvFingerprint, fingerprint);
  assert.equal(payload.masterCvEditRevision, editRevision);
  assert.ok(!("masterCvFile" in payload));
  assert.ok(!("cv" in payload));
  assert.doesNotMatch(serialized, /sourceDocumentId|downloadUrl|data:image/);
});

test("die eine Client-Bereitschaft verlangt Persistenz und vollständige DOCX-Identität", () => {
  const state = stateFixture();
  const input = {
    document: state.documents[0],
    documentId,
    content: state.masterCvContent,
    persisted: true,
  };

  assert.equal(isApplicationMasterCvReady(input), true);
  assert.equal(
    isApplicationMasterCvReady({ ...input, persisted: false }),
    false,
  );
  assert.equal(
    isApplicationMasterCvReady({
      ...input,
      document: { ...input.document, contentType: "application/pdf" },
    }),
    false,
  );
  assert.equal(
    isApplicationMasterCvReady({
      ...input,
      content: { ...input.content, sourceDocumentId: "upload-other" },
    }),
    false,
  );
});
