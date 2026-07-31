# Selbstpflegende Planungs- und Entscheidungszentrale

Die Sites-Webanwendung unter `web/` behandelt einen leeren Kalender nicht als
Freizeit. Maßgeblich ist der zentrale `PlanningHealthReport` mit den Zuständen
`unknown`, `stale`, `incomplete`, `conflicted`, `healthy` und
`intentionally_free`.

## Verbindliche Regeln

- Detailplanung: sieben rollierende Tage; Fristenprüfung: 45 Tage.
- Heute und morgen ungeplant: **Dringend & wichtig**; spätere Leertage:
  **Wichtig**, mit Eskalation innerhalb von 48 Stunden.
- Ein Tag ist nur bewusst frei, Urlaub oder Krankheit, wenn ein `DayIntent`
  ausdrücklich gespeichert wurde und die Kalenderdaten frisch und vollständig
  sind. Geburtstage oder Feiertage allein sind kein Tagesplan.
- Automatische Fokusplanung nutzt 07:00–20:00 Uhr, 15 Minuten Übergangspuffer,
  50-Minuten-Blöcke und höchstens sechs automatisch belegte Fokusstunden pro
  Tag.
- Fremde Google-Termine werden ausschließlich für Belegung und Konflikte
  gelesen. PATCH und DELETE akzeptieren nur Termine mit privaten Gerris-
  Metadaten sowie – sofern vorhanden – dem gespeicherten ETag.

## Verwaltete Kalender

Gerris Kompass ordnet genau vier eigene Kalender eindeutig zu:

1. `Fokus & Aufgaben & Fristen`
2. `Bewerbungen`
3. `Geburtstage und Feiertage`
4. `Privat`

Ein gleichnamiger eigener Kalender wird wiederverwendet. Bei mehreren eigenen
Treffern entsteht eine kritische Auswahl-Lücke. Fehlende Kalender werden erst
im aktivierten Modus „Sichere Automatik“ angelegt. Für `Privat` muss die
ACL-Prüfung ausschließlich den Eigentümerzugriff bestätigen; andernfalls
bleiben sensible Schreibvorgänge blockiert.

Das Routing wertet keine Texte semantisch aus:

- `confidential=true` → `Privat`
- Bewerbung → `Bewerbungen`
- expliziter Geburtstag/Feiertag → `Geburtstage und Feiertage`
- sonstige nicht vertrauliche Quelle → `Fokus & Aufgaben & Fristen`

## Dry-run und sichere Automatik

Der erste Abgleich ist immer ein Dry-run. Er speichert einen `SyncRun` mit
Soll-/Ist-Zahlen, schreibt aber nichts bei Google. Die UI erlaubt die Aktivierung
der sicheren Automatik nur nach dem neuesten erfolgreichen, konfliktfreien
Dry-run. Anschließend laufen Abgleiche beim App-Start, nach Fachänderungen, bei
Kalenderaktualisierung und während einer offenen Sitzung als Frischeprüfung.
Ein separater Cron-Trigger ist in v1 nicht erforderlich.

Die Outbox besitzt pro Operation einen stabilen Deduplizierungsschlüssel.
Google-Ereignisse werden zusätzlich über Quellenart, Quellen-ID und Vorkommen
gesucht. So bleibt ein Retry idempotent, auch wenn Google bereits geschrieben,
D1 die Verknüpfung aber noch nicht bestätigt hat.

## Tagebuch und Entscheidungen

Beim Speichern wird der vollständige Tagebucheintrag automatisch als
nicht vertrauenswürdige Quelle analysiert. Offensichtliche Zugangsdaten werden
vorher entfernt; der OpenAI-Aufruf verwendet `store:false`, keine Websuche und
keine Anhänge. Nur strukturierte Vorschläge mit Belegstelle und Konfidenz werden
als `OpenTopic` gespeichert. Ohne OpenAI-Key extrahiert der deterministische
Fallback nur ausdrücklich ausgefüllte nächste Schritte, Wochenfokus und klare
Fragesätze.

Die Tagebuchansicht zeigt dauerhaft „Entscheidung nötig“, „Nächster Schritt“,
„Warten“ und „Eingeplant“. Ein Kalendervorschlag verlangt vor Bestätigung einen
Zeitpunkt und die explizite Auswahl `Privat` oder `Fachkalender`. Kritische Gaps
müssen gelöst oder mit Begründung zurückgestellt sein, bevor der Tagesabschluss
als vollständig geprüft gilt.

## Persistenz und APIs

Migration `web/drizzle/0004_brief_killer_shrike.sql` ergänzt strukturierte D1-
Tabellen für Bereichskalender, Kalenderlinks, Gaps, Tagesabsichten, offene
Themen, Entscheidungen, Outbox und Sync-Läufe. Das AppState-v1-JSON bleibt
unverändert lesbar. `PUT /api/state` verwendet einen Revisions-ETag und weist
konkurrierende Schreibvorgänge mit HTTP 409 ab.

Zentrale Endpunkte:

- `GET /api/planning`
- `POST /api/planning/reconcile`
- `PATCH /api/planning/automation`
- `PATCH /api/planning/gaps/:gapId`
- `PUT|DELETE /api/planning/day-intents`
- `POST|PATCH /api/planning/topics`
- `POST /api/planning/decisions`
- `PATCH|DELETE /api/calendar/events/:eventId`

Alle Daten sind eigentümergebunden; alle Mutationen verlangen denselben
Ursprung. Google- und OpenAI-Secrets bleiben ausschließlich Runtimewerte.
