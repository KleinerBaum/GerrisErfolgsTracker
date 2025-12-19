# Troubleshooting

## Speicherpfad & OneDrive
- Prüfe `GERRIS_ONEDRIVE_DIR`. Wenn der Ordner existiert, nutzt die App `gerris_state.json` genau dort.
- Ohne OneDrive-Hinweis fällt die App auf `.data/gerris_state.json` im Projektverzeichnis zurück. Lege den Ordner an, falls er fehlt.
- Auf Windows helfen `echo %OneDrive%` oder `echo %USERPROFILE%\OneDrive` beim Auffinden des Sync-Ordners.

## Typische Probleme
- **OneDrive synchronisiert nicht:** Stelle sicher, dass der Sync-Client läuft und der Ordner `GerrisErfolgsTracker` nicht vom Abgleich ausgeschlossen ist. Teste, ob eine leere Testdatei ankommt.
- **Community Cloud verliert Daten:** Die Datei kann nach einem Neustart verschwinden. Sichere den Inhalt über OneDrive oder lade die Datei regelmäßig herunter.
- **Pfad nicht beschreibbar:** Schreibrechte des Zielordners prüfen; notfalls Pfad mit `GERRIS_ONEDRIVE_DIR` auf einen nutzbaren Speicherort legen.

## JSON kaputt oder leer
- Benenne `gerris_state.json` in `gerris_state.bak` um und starte die App neu. Eine frische Datei wird angelegt.
- Öffne das Backup in einem JSON-Validator und kopiere nur gültige Abschnitte zurück.
- Entferne unvollständige Einträge (z. B. abgebrochene Manuelle Bearbeitung), wenn das Laden weiterhin fehlschlägt.

## Reset & Wiederherstellung
- Vollständiger Reset: Datei löschen oder umbenennen, App neu starten, danach bei Bedarf einzelne Aufgaben aus dem Backup übernehmen.
- Backup-Strategie: Versionierung in OneDrive aktivieren oder regelmäßig eine Kopie exportieren. So lassen sich versehentliche Änderungen rückgängig machen.

## AI & Secrets
- API-Keys ausschließlich über `.streamlit/secrets.toml` oder Umgebungsvariablen setzen, nie im Code oder JSON-Backup ablegen.
- Entferne vertrauliche Textbausteine aus Beschreibungen, wenn du keinen Cloud-Speicher nutzen willst.
