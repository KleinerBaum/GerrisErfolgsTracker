# Gerris Kompass – verbindliche Produktqualitätsmatrix

Diese Matrix definiert, wann die Sites-Webanwendung als vollständig und
versand- beziehungsweise alltagstauglich gilt. Ein grüner Build allein genügt
nicht. Für jeden Bereich müssen Fachlogik, Datenzustände, Bedienbarkeit,
Barrierefreiheit, Datenschutz und Fehlerverhalten nachgewiesen sein.

## Gemeinsame Qualitätsstandards

| Standard | Verbindlicher Nachweis | Aktueller Stand |
| --- | --- | --- |
| Private Identität | Jede private API liest die Sites-Identität serverseitig; jede Mutation prüft zusätzlich Same-Origin. | Teilweise automatisiert geprüft; vollständige Routenmatrix ausstehend. |
| Führende Datenquelle | D1 ist führend für App-Zustand, Google für verbundene Workspace-Daten und R2 für Dateien. Browser-Speicher ist nur Offline-Rückfall oder Darstellungspräferenz. | Bewusste Konfliktauflösung mit automatischem Lokal-Backup implementiert; Offline-Rückkehr benötigt noch die vollständige UX-Abnahme. |
| Keine Scheindaten beim Laden | Vor Abschluss der privaten Zustandsauflösung erscheinen keine Beispielwerte als vermeintlich echte Daten. | Implementiert; Regressionstest ergänzt. |
| Navigation | Jeder Hauptbereich besitzt eine teilbare URL, Browser-Zurück funktioniert und der Fokus wechselt zum neuen Hauptinhalt. | Implementiert; Browser-Abnahme ausstehend. |
| Tastatur und Screenreader | Sprunglink, sichtbarer Fokus, semantische Überschriften, beschriftete Statusmeldungen und vollständig bedienbare Dialoge. | Sprunglink, Statusbasis und gemeinsames Dialog-/Fokusmanagement implementiert; Browser-Abnahme ausstehend. |
| Responsive Bedienung | Kein horizontaler Zwangsscroll für Hauptaktionen; mindestens 44 px Touch-Ziele; aktuelle Ansicht bleibt mobil sichtbar. | Mobile Navigation und Touch-Basis implementiert; komponentenweise Abnahme ausstehend. |
| Lesbarkeit | Deutsche Mikrocopy, klare Zustände, keine technischen Rohfehler, ausreichender Kontrast und keine informationskritische Kleinstschrift. | Kontrastmodi und appweite Untergrenze von 0,72 rem ergänzt; visuelle Typografie-Abnahme ausstehend. |
| Fehlerzustände | Laden, leer, getrennt, nicht autorisiert, teilweise verfügbar, Konflikt und Wiederholen sind fachlich unterscheidbar. | Unterschiedlich je Bereich; gemeinsame Fehlerkomponenten ausstehend. |
| Rückwärtskompatibilität | Alte AppState-, Tagebuch-, Bewerbungs-, Gamification- und Master-CV-Zustände werden verlustfrei normalisiert. | Breite Testbasis vorhanden; zentrale Zustandsvalidierung bleibt zu härten. |
| Abschlussqualität | Lint, TypeScript, Produktionsbuild, Tests, Python-Checks, Diff-Check und private Release-Abnahme. | Für jede Ausbaustufe erneut erforderlich. |

## Komponentenverträge

### Zentrale

- Zeigt nur bereichsübergreifende, handlungsrelevante Signale.
- Prioritäten sind nachvollziehbar und führen direkt zur Quelle.
- KPI-Ziele, Planungslücken und Google-Tasks-Berechtigung widersprechen sich
  nicht.
- Leere oder noch ladende Quellen werden nicht als „alles erledigt“ dargestellt.

### Aufgaben

- Google Tasks ist nach Verbindung die führende Aufgabenquelle.
- Anlegen, Ändern, Abschließen, Wiederöffnen und Löschen sind idempotent und
  in allen Ansichten konsistent.
- Lokale Altaufgaben werden nur nach ausdrücklicher Übernahme migriert.
- Belohnungen werden erst nach bestätigter Einstufung und höchstens einmal
  verbucht.

### Kalender und Planung

- Tages-, Wochen-, Monats- und Agendaansicht teilen dieselbe Zeitzonenlogik.
- Ein leerer, veralteter oder unvollständig verbundener Kalender gilt niemals
  automatisch als frei.
- Private Termine, Geburtstage, Fristen und Fokusblöcke folgen den dokumentierten
  Routing- und Verfügbarkeitsregeln.
- Sichere Automatik wird erst nach einem erfolgreichen konfliktfreien Dry-run
  freigegeben.

### Finanzen

- Vergangene, fällige und geplante Kosten sowie Einnahmen und Kontostände sind
  rechnerisch konsistent.
- Beträge werden deutsch eingegeben und formatiert; leere Kontostände bleiben
  unbekannt statt fälschlich null Euro.
- Zahlungserinnerungen benötigen eine explizite Kalenderfreigabe.
- Vertrauliche Finanzdaten erscheinen weder in Logs noch in KI-Prompts.

### Unterlagen und Drive

- R2-Uploads und Google-Drive-Dateien sind klar unterscheidbar.
- Drive-Zugriff bleibt auf den konfigurierten Stammordner begrenzt.
- Vorschau, Download, Suche, Breadcrumbs und Fehlerzustände funktionieren für
  jede unterstützte Dateiklasse.
- Dateiinhalte werden nicht unnötig in AppState oder Browser-Speicher kopiert.

### Bewerbungen

- Recherche, bestätigte Stellenfakten, persönliche Angaben und Master-CV-Evidenz
  bleiben getrennte Datenklassen.
- Versandfertige Pakete benötigen Master-CV, erreichbare KI, Evidenzzuordnung
  und das gemeinsame Qualitätsgate.
- Manuelle Änderungen sperren externe Aktionen bis zur erneuten Prüfung.
- Pipeline, Fristen, Kontakte, Aktivitäten und private Unterlagen bleiben über
  Zustandsmigrationen erhalten.

### Kontakte

- CRUD, Suche und CSV-Import behandeln Dubletten, leere Namen, Sonderzeichen,
  Geburtstage und Links nachvollziehbar.
- Kontaktaktionen verwenden sichere `mailto:`, `tel:` und HTTP(S)-Ziele.
- Löschen erfordert eine klare Bestätigung und zerstört keine verknüpften
  Bewerbungsinformationen unbemerkt.

### Tagebuch

- Freies Speichern bleibt von KI-Analyse und Planungsvorschlägen getrennt.
- Nachträge überschreiben vorhandene Tagesdaten nicht.
- Vorschläge enthalten Belegstelle und Konfidenz und werden erst nach
  Bestätigung zu Aufgaben, Entscheidungen oder Terminen.
- Tagesabschluss berücksichtigt offene kritische Planungslücken.

### Belohnungssystem

- Punktebuch, Ziele, Rhythmen, Etappen und Einlösungen bleiben deterministisch.
- Darstellungsmodus verändert keine gespeicherten Ressourcen.
- Reduzierte Bewegung deaktiviert nicht notwendige Animationen.
- Belohnungen unterstützen den Arbeitsfluss und blockieren keine Kernaktion.

### Einstellungen und Sicherung

- Integrationsstatus, Privatsphäre, Ziele und Darstellungsoptionen sind klar
  getrennt.
- Backup-Export ist jederzeit möglich; Import wird vollständig validiert und
  bleibt abwärtskompatibel.
- Revisionskonflikte bieten vor einer Serverübernahme einen lokalen Export.
- Rücksetzen nennt exakt, welche Daten erhalten beziehungsweise ersetzt werden.

## Abschlussnachweise

Vor der Zielerreichung müssen zusätzlich zur automatisierten Testmatrix folgende
Nachweise vorliegen:

1. Jede Hauptansicht mit realistischem Inhalt sowie Laden-, Leer- und
   Fehlerzustand.
2. Tastaturdurchlauf für Navigation, Dialoge, Tabellen, Formulare und
   Dateivorschau.
3. Responsive Abnahme auf schmalem Telefon, großem Telefon, Tablet und Desktop.
4. Echtes Google-Workspace-Smoke-Testing innerhalb der freigegebenen privaten
   Umgebung, ohne automatische E-Mail-Sendung.
5. D1-Revisionskonflikt, Offline-Rückfall, Wiederverbindung und Backup-Restore.
6. Private Sites-Freigabe mit Eigentümerzugriff und anschließendem Readback.
