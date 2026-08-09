# Security

GerrisErfolgsTracker verarbeitet persönliche Aufgaben-, Kalender-, Bewerbungs- und Dokumentdaten. Sicherheits- und Datenschutzprobleme bitte privat an die Repository-Eigentümer melden; keine sensiblen Details in öffentliche Issues oder Logs schreiben.

## Grundsätze

- Secrets gehören ausschließlich in lokale Secret-Dateien, Environment-Variablen oder Sites-Laufzeitwerte.
- Mutierende Web-Routen müssen Owner-Bindung und Same-Origin-Prüfung beibehalten.
- Beschädigte State-Daten dürfen nicht als leerer Zustand in Automatik- oder Löschpfade gelangen.
- OpenAI-, Google-, Brevo- und R2-Integrationen bleiben optional und müssen bei fehlender Konfiguration sicher degradieren.
- Persönliche Daten und vollständige Bewerbungsunterlagen gehören nicht in Testfixtures, Quelltextverträge oder Debug-Logs.

## Prüfgrenzen

CI prüft derzeit nicht automatisch echte Cloudflare-, D1-, R2-, OAuth-, Google- oder Browser-Produktionsläufe. Diese Unsicherheit muss bei Releases ausdrücklich als offene Abnahme dokumentiert werden.
