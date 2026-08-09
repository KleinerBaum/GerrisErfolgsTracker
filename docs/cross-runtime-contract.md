# Python und Sites: Laufzeitvertrag

Python/Streamlit und die Sites-Webapp sind zwei getrennte Laufzeiten. Ihre Persistenzformate sind nicht austauschbare Backups.

| Konzept | Python/Streamlit | Sites/Web |
| --- | --- | --- |
| Primärer State | lokale JSON-Datei | D1 `user_states` |
| Aufgaben-ID | lokale Todo-UUID | Google-Task-ID bzw. `legacyId` |
| Zeitbasis | timezone-aware Python-Datetime, intern UTC | ISO-Strings mit Europe/Berlin-Fachlogik |
| Kalenderreferenz | lokale/Google-Service-Daten | D1-Link plus Google-Event-ID |
| Dokumente | lokale Pfadreferenzen | Drive-/R2-Referenzen |

Ein Python-Backup darf daher nicht in `/api/state` importiert werden, und ein Sites-AppState darf nicht als Streamlit-State geladen werden. Verlustfreie Interoperabilität existiert aktuell nicht.

Wenn künftig ein Adapter benötigt wird, muss er einen versionierten Vertrag, Fixtures für IDs/Enums/Zeitzonen und explizite Verlustregeln besitzen. Bis dahin bleibt die Trennung bewusst und wird in Release-/Recovery-Dokumentation sichtbar gemacht.
