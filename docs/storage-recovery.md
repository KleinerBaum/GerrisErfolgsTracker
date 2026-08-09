# Python-State: Recovery und Persistenz

Diese Anleitung gilt für die Streamlit-Laufzeit. Der kanonische lokale Fallback ist:

```text
.data/GerrisErfolgsTracker/gerris_state.json
```

## Verhalten bei Fehlern

- Fehlt die Datei, startet die App mit Defaults.
- Ist eine vorhandene Datei unlesbar oder kein JSON-Objekt, wird sie als `gerris_state.corrupt-<UTC-Zeitstempel>.json` quarantänisiert.
- Die App speichert in diesem Zustand keine Defaults oder weiteren impliziten Mutationen. Ein Wiederherstellungsschritt muss ausdrücklich erfolgen.
- Erfolgreiche State-Schreibvorgänge verwenden eine Lock-Datei, eine temporäre Datei im selben Verzeichnis, `fsync` und anschließend `os.replace`.

Die Lock-Datei schützt konkurrierende Prozesse auf demselben POSIX-Dateisystem. Sie ersetzt keinen verteilten Versionsvertrag für OneDrive-Konflikte; parallele Sessions müssen weiterhin bewusst zusammengeführt werden.

## Wiederherstellung

1. Quarantänedatei und eventuelle OneDrive-Versionen unverändert sichern.
2. Ein bekannt gültiges `gerris_state.json`-Backup über **Einstellungen → Sicherheit & Daten** importieren.
3. Wenn kein gültiges Backup existiert, **Session zurücksetzen** nur nach bewusster Bestätigung verwenden.
4. Die Anwendung neu laden und prüfen, dass der State wieder gespeichert und lesbar ist.

Keine unvalidierten verschachtelten Abschnitte direkt in die produktive JSON-Datei kopieren. Für Recovery-Tests gelten mindestens:

```bash
.venv/bin/python -m pytest -q tests/test_storage.py tests/test_state_init.py
.venv/bin/python -m ruff check gerris_erfolgs_tracker/storage/__init__.py gerris_erfolgs_tracker/state_persistence.py
```
