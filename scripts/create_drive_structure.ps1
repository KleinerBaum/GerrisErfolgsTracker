param(
    [string]$DriveRoot = "G:\Meine Ablage",
    [string]$RootFolderName = "Unterlagen und Dokumente"
)

$ErrorActionPreference = "Stop"

$structure = [ordered]@{
    "Arbeit" = @("Arbeitsverträge", "Gehaltsabrechnungen", "Arbeitszeugnisse", "Fortbildungen", "Schriftverkehr")
    "Ausweise" = @("Personalausweis", "Reisepass", "Führerschein", "Sonstige Nachweise", "Erneuerungen")
    "Bundesagentur für Arbeit" = @("Anträge", "Bescheide", "Vermittlungsvorschläge", "Nachweise", "Termine und Schriftverkehr")
    "Bankverbindungen" = @("Kontoeröffnungsunterlagen", "Kontoauszüge", "Kreditkarten", "Darlehen", "Schriftverkehr")
    "Bewerbung" = @("Lebenslauf", "Anschreiben", "Zeugnisse und Zertifikate", "Stellenausschreibungen", "Absagen und Zusagen")
    "Bücher" = @("Rechnungen und Belege", "Notizen und Zusammenfassungen", "Wunschliste", "Verzeichnisse")
    "Carla" = @("Allgemeine Unterlagen", "Gesundheit und Versicherungen", "Bildung und Betreuung", "Verträge und Finanzen", "Schriftverkehr")
    "ERGO" = @("Verträge und Policen", "Beitragsrechnungen", "Leistungsfälle", "Kündigungen", "Schriftverkehr")
    "FH" = @("Immatrikulation und Bescheinigungen", "Prüfungen und Noten", "Studienunterlagen", "Gebühren und Finanzierung", "Schriftverkehr")
    "Jobcenter-Unterlagen" = @("Anträge", "Bescheide", "Nachweise", "Kosten der Unterkunft", "Termine und Schriftverkehr")
    "Kontakte, Lesezeichen und Passwörter" = @("Kontakte", "Lesezeichen", "Passwortmanager-Hinweise", "Notfallzugang-Hinweise", "Archiv")
    "Kündigungen" = @("Vorlagen", "Versicherungen", "Verträge und Abos", "Arbeit und Behörden", "Versandnachweise und Bestätigungen")
    "Miriam" = @("Allgemeine Unterlagen", "Gesundheit und Versicherungen", "Bildung und Betreuung", "Verträge und Finanzen", "Schriftverkehr")
    "Rechnungen" = @("Eingangsrechnungen", "Ausgangsrechnungen", "Bezahlte Rechnungen", "Reklamationen und Gutschriften", "Garantien und Belege")
    "Rentenversicherung" = @("Versicherungsverlauf", "Renteninformationen", "Kontenklärung", "Anträge und Bescheide", "Schriftverkehr")
    "Selbstständigkeit" = @("Gewerbe und Anmeldung", "Verträge und Angebote", "Ausgangsrechnungen", "Eingangsrechnungen und Belege", "Steuer und Buchhaltung")
    "Steuererklärung" = @("2023 und älter", "2024", "2025", "2026", "Dauerunterlagen")
    "Studium" = @("Immatrikulation", "Module und Vorlesungen", "Prüfungen und Leistungen", "Abschlussarbeit", "Finanzierung und Gebühren")
    "Wohnung" = @("Mietvertrag und Nachträge", "Betriebskostenabrechnungen", "Nebenkosten und Versorger", "Reparaturen und Mängel", "Wichtige Absprachen")
}

if (-not (Test-Path -LiteralPath $DriveRoot -PathType Container)) {
    throw "Google-Drive-Stamm nicht gefunden: $DriveRoot"
}

$created = [System.Collections.Generic.List[string]]::new()
$reused = [System.Collections.Generic.List[string]]::new()

function Ensure-Folder {
    param([string]$Path)

    if (Test-Path -LiteralPath $Path -PathType Container) {
        $script:reused.Add($Path)
        return
    }
    [System.IO.Directory]::CreateDirectory($Path) | Out-Null
    $script:created.Add($Path)
}

$targetRoot = Join-Path -Path $DriveRoot -ChildPath $RootFolderName
Ensure-Folder -Path $targetRoot

foreach ($entry in $structure.GetEnumerator()) {
    $mainPath = Join-Path -Path $targetRoot -ChildPath $entry.Key
    Ensure-Folder -Path $mainPath
    foreach ($subFolder in $entry.Value) {
        Ensure-Folder -Path (Join-Path -Path $mainPath -ChildPath $subFolder)
    }
}

$mainFolders = Get-ChildItem -LiteralPath $targetRoot -Directory
$subFolderCount = 0
foreach ($mainFolder in $mainFolders) {
    $subFolderCount += @(Get-ChildItem -LiteralPath $mainFolder.FullName -Directory).Count
}

[ordered]@{
    rootPath = $targetRoot
    expectedMainFolders = $structure.Count
    actualMainFolders = $mainFolders.Count
    expectedSubFolders = 94
    actualSubFolders = $subFolderCount
    createdCount = $created.Count
    reusedCount = $reused.Count
} | ConvertTo-Json -Compress
