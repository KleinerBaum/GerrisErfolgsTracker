import assert from "node:assert/strict";
import test from "node:test";

import {
  parseViewKey,
  urlForView,
  viewFromUrl,
} from "../lib/view-navigation.ts";

test("liest jeden gültigen Gerris-Bereich aus einer URL", () => {
  const views = [
    "today",
    "tasks",
    "calendar",
    "finance",
    "documents",
    "applications",
    "contacts",
    "journal",
  ];

  for (const view of views) {
    assert.equal(
      viewFromUrl(`https://kompass.example.test/?bereich=${view}`),
      view,
    );
  }
});

test("fällt bei unbekannten oder manipulierten Ansichten sicher auf die Zentrale zurück", () => {
  assert.equal(parseViewKey(null), "today");
  assert.equal(parseViewKey("../settings"), "today");
  assert.equal(
    viewFromUrl("https://kompass.example.test/?bereich=unbekannt"),
    "today",
  );
});

test("erzeugt teilbare Bereichs-URLs und bewahrt andere Parameter", () => {
  assert.equal(
    urlForView(
      "https://kompass.example.test/?quelle=intern#inhalt",
      "applications",
    ),
    "/?quelle=intern&bereich=applications#inhalt",
  );
  assert.equal(
    urlForView(
      "https://kompass.example.test/?quelle=intern&bereich=tasks",
      "today",
    ),
    "/?quelle=intern",
  );
});
