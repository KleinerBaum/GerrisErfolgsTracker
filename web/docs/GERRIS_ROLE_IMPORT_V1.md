# GerrisRoleImportV1

`GerrisRoleImportV1` ist der öffentliche, versionierte Übergabevertrag für
Stellentreffer aus ChatGPT. Das Sites-Frontend ruft Indeed, Jooble oder LinkedIn
nicht direkt auf. Ein Treffer wird zunächst nur vorgemerkt und erst durch die
Gerris-Vakanzrecherche zur bestätigten Rollenquelle.

## Grenzen

- Höchstens 20 Kandidaten und 500 KB pro Import.
- Zulässige Provider: `indeed`, `jooble`, `linkedin`, `employer`, `recruiter`
  und `manual`.
- Alle URLs müssen öffentliche HTTP(S)-URLs ohne Zugangsdaten sein.
- `source_url` ist nur ein behaupteter Original-Link. Er wird als
  Entdeckungsquelle gespeichert, nie ungeprüft als kanonische `sourceUrl`.
- Master-CV, Profilzusammenfassung, Ausbildungs- oder Berufshistorie,
  Kontaktdaten der bewerbenden Person und Bewerbungshistorie sind verboten.
  `contact` bezeichnet ausschließlich einen in der Stellenquelle
  veröffentlichten Arbeitgeber- oder Recruitingkontakt.
- `assessment` ist beratend. Der Import ändert weder die Gerris-Empfehlung noch
  den Bewerbungsstatus.

## Beispiel

```json
{
  "schema": "GerrisRoleImportV1",
  "indeed_profile_status": "missing",
  "candidates": [
    {
      "provider": "indeed",
      "provider_job_id": "synthetic-indeed-001",
      "discovery_url": "https://de.indeed.com/viewjob?jk=synthetic-001",
      "source_url": "https://jobs.example.com/roles/ai-product-builder",
      "captured_at": "2026-08-09T09:00:00.000Z",
      "checked_at": null,
      "employer": "Beispiel Digital GmbH",
      "title": "AI Product Builder",
      "location": "Berlin · hybrid",
      "published_at": "2026-08-05",
      "contract_type": "Unbefristet · Vollzeit",
      "salary": {
        "value": "",
        "basis": "not_listed"
      },
      "contact": {
        "name": "Alex Beispiel",
        "email": "",
        "phone": ""
      },
      "description": "Synthetische QA-Anzeige für eine AI-App-Rolle.",
      "assessment": {
        "recommendation": "maybe",
        "fit": 8,
        "shortlist_chance": 55,
        "main_match": "Angewandte AI- und Prozessautomatisierung.",
        "main_risk": "Domänenkenntnis noch zu belegen.",
        "cv_angle": "Messbare Automatisierungsergebnisse.",
        "evidence_urls": [
          "https://jobs.example.com/roles/ai-product-builder"
        ]
      }
    }
  ]
}
```

Für eine reine Marktspanne wird `salary.basis` auf `market_estimate` gesetzt.
Nach der Originalprüfung speichert Gerris eine fehlende veröffentlichte
Vergütung als `not_listed` und hält die Marktspanne separat in
`marketSalaryEstimate` beziehungsweise im bestätigten Forschungsfakt
`market.salary`.

## Lebenszyklus

1. Vorschau ohne Persistenz und mit Datenschutz-, Vollständigkeits- und
   Dublettenprüfung.
2. Sichtbare Auswahl erzeugt `status = research`,
   `recommendation = undecided` und `verificationStatus = unverified`.
3. Originalprüfung bestätigt exakte Arbeitgeber-, ATS- oder autorisierte
   Recruiteranzeige, Datum, Status und Rollenfakten.
4. Apply/Maybe/Skip wird separat vom Bewerbungsstatus bestätigt.
5. Nur eine offene, geprüfte Apply-/Maybe-Rolle darf in die
   Unterlagenerstellung. Bewerbung und Nachrichten bleiben manuelle externe
   Schritte.
