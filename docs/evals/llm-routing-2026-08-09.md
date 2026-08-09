# Live-Eval: dokumentbezogenes Modellrouting

Datum: 2026-08-09  
Daten: ausschließlich synthetische, nicht personenbezogene Bewerbungsdaten  
API: OpenAI Responses API, Standardverarbeitung, `store=false`

## Erfolgreiche repräsentative Ergebnisse

| Ergebnis | Modell | Aufwand | Läufe | Laufzeit | Eingabe | Ausgabe | Reasoning | Cache-Schreibvorgang | Geschätzte Kosten |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| CV | `gpt-5.6-terra` | Mittel | 1 | 31,989 s | 4.239 | 4.018 | 516 | 4.236 | 0,073515 USD |
| Anschreiben | `gpt-5.6-terra` | Mittel | 2 | 26,856 s | 12.767 | 2.970 | 858 | 12.761 | 0,084443 USD |
| Bewerbungs-Mail | `gpt-5.6-luna` | Niedrig | 1 | 3,313 s | 7.156 | 467 | 89 | 7.153 | 0,011746 USD |
| Unternehmensbriefing | `gpt-5.6-luna` | Niedrig | 2 | 12,968 s | 16.507 | 2.402 | 258 | 16.501 | 0,035044 USD |
| Interviewvorbereitung | `gpt-5.6-luna` | Mittel | 1 | 12,332 s | 8.693 | 2.738 | 88 | 8.690 | 0,027294 USD |

Alle fünf Ergebnisarten bestanden ihr artefaktbezogenes Qualitätsgate. Der kombinierte optionale Lauf mit lokal freigegebenem synthetischem CV und Anschreiben bestand zusätzlich das paketweite V4-Gate. Gesamtkosten der hier ausgewiesenen erfolgreichen Pfade: rund 0,232042 USD beziehungsweise 0,046408 USD je erfolgreichem Ergebnis.

Die Kostenberechnung verwendet die am Eval-Tag veröffentlichten Standardpreise unterhalb der Langkontextschwelle: Luna 1,00 USD Eingabe / 0,10 USD Cache-Lesen / 6,00 USD Ausgabe und Terra 2,50 USD / 0,25 USD / 15,00 USD je eine Million Tokens. Cache-Schreibvorgänge sind mit dem 1,25-fachen Eingabepreis berücksichtigt. Quelle: https://openai.com/api/pricing/

## Optimierungen aus den Vorläufen

- Exakte Pflichtüberschriften für CV, Unternehmensbriefing und Interviewvorbereitung wurden in die artefaktspezifischen Instruktionen aufgenommen.
- Master-CV-Metadaten werden nur bei deterministischer Text- oder Tokenübereinstimmung lokal an vorhandene Evidenz-IDs gebunden; es werden keine Belege erfunden.
- `evidenceIds` und `researchIds` werden im Prompt klar getrennt.
- Die Qualitätsziele bleiben 750–1.150 Wörter für den Zwei-Seiten-CV und 320–500 Wörter für das einseitige Anschreiben. Das Gate toleriert bei ansonsten vollständiger Evidenzbindung 625 beziehungsweise 300 Wörter, um kostenintensive Reparaturen wegen knapper Zählabweichungen zu vermeiden.
- Sol wurde nicht live vorbelegt oder evaluiert, weil es gemäß Routingkonzept ausschließlich eine bewusste Nutzerauswahl ist.

Prompts, API-Schlüssel und erzeugte Dokumentinhalte wurden nicht in diesen Bericht übernommen.

## DOCX-Rendering

Die DOCX-Exporte wurden mit synthetischen Inhalten erzeugt, mit LibreOffice in PDF gerendert und anschließend seitenweise als PNG visuell geprüft:

| Dokument | Seiten | Ergebnis |
| --- | ---: | --- |
| Anschreiben | 1 | Keine Überlagerung, kein Beschnitt, sauberer Abschluss auf Seite 1 |
| CV | 2 | Vollständiger kontrollierter Seitenwechsel, Footer 1/2 und 2/2, kein Beschnitt |
| Unternehmensbriefing | 1 | Überschriften, Listen und Quellenlink vollständig sichtbar |
| Interviewvorbereitung | 1 | Hervorhebungen, Listen und Footer vollständig sichtbar |

Damit sind das einseitige Anschreiben, der zweiseitige CV und jede Seite der auswählbaren DOCX-Zusatzdokumente LibreOffice-/OpenOffice-kompatibel visuell geprüft. Die Bewerbungs-Mail bleibt ein Text-/Markdown-Ergebnis und besitzt keinen eigenen DOCX-Export.
