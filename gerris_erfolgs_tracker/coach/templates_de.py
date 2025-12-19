# gerris_erfolgs_tracker/coach/templates_de.py
# Starter pack: 30 DE templates for sidebar Coach (image + text only).
# Safety: psychoeducational coach, not therapist. No diagnosis, no crisis/helpline content.

from __future__ import annotations

TEMPLATES_DE: list[dict] = [
    # -------------------------
    # TASK_COMPLETED (micro) — Stellensuche (4)
    # -------------------------
    {
        "template_id": "de_task_completed_stellensuche_01",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "dry",
        "face": "wink",
        "category_tags": ["Stellensuche"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Bewerbungs-Drama? Eher Bewerbungs-Disziplin.",
        "body_md": "Erledigt. Kurz feiern, dann winzig weitermachen: **2 Minuten** – nur Betreffzeile für die nächste Bewerbung vorbereiten.",
        "cta": {"label": "Zur Aufgabenliste", "action": "open_tasks", "payload": {"category": "Stellensuche"}},
    },
    {
        "template_id": "de_task_completed_stellensuche_02",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "warm",
        "face": "smile",
        "category_tags": ["Stellensuche"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Nice. Du bewegst den Stein.",
        "body_md": "Ein Schritt gemacht. Mini-Intervention: **eine** Sache notieren, die heute leichter war als letzte Woche. Das trainiert Fortschrittssicht.",
        "cta": {"label": "Notiz öffnen", "action": "open_journal", "payload": {}},
    },
    {
        "template_id": "de_task_completed_stellensuche_03",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "tough_love",
        "face": "stern",
        "category_tags": ["Stellensuche"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Guter Move. Nicht überdenken.",
        "body_md": "Du hast geliefert. Jetzt: **Wenn** du heute noch 5 Minuten hast, **dann** mache den nächsten Kleinschritt (Kontakt öffnen → 1 Satz schreiben).",
        "cta": {"label": "Nächste Stellensuche-Aufgabe", "action": "open_tasks", "payload": {"category": "Stellensuche"}},
    },
    {
        "template_id": "de_task_completed_stellensuche_04",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "dry",
        "face": "thinking",
        "category_tags": ["Stellensuche"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Output statt Grübel-Abo.",
        "body_md": "Erledigt ist erledigt. Mini-Upgrade: Leg dir eine **Standard-Antwort** als Textbaustein an. Einmal Aufwand, danach Rückenwind.",
        "cta": {"label": "Aufgabenliste", "action": "open_tasks", "payload": {"category": "Stellensuche"}},
    },

    # -------------------------
    # TASK_COMPLETED (micro) — Administratives (4)
    # -------------------------
    {
        "template_id": "de_task_completed_admin_01",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "dry",
        "face": "wink",
        "category_tags": ["Administratives"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Papierkram: 1 — Ausreden: 0",
        "body_md": "Sauber. Nächster Mini‑Move: **7-Minuten‑Timer** und nur den ersten Absatz der nächsten Admin‑Sache antippen.",
        "cta": {"label": "Admin-Aufgaben", "action": "open_tasks", "payload": {"category": "Administratives"}},
    },
    {
        "template_id": "de_task_completed_admin_02",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "warm",
        "face": "smile",
        "category_tags": ["Administratives"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Unsexy, aber wirksam.",
        "body_md": "Das war Selbstfürsorge in Verkleidung. Mini-Intervention: **ein** Häkchen im Kopf setzen: *„Ich kann Dinge abschließen.“*",
        "cta": {"label": "Ok", "action": "dismiss", "payload": {}},
    },
    {
        "template_id": "de_task_completed_admin_03",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "tough_love",
        "face": "stern",
        "category_tags": ["Administratives"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Du bist nicht deine To‑Do‑Liste. Aber du steuerst sie.",
        "body_md": "Gut. Jetzt nicht den Rest des Tages verhandeln: **1 Mini‑Block** (10 Minuten) fürs nächste Admin‑Thema. Danach Schluss.",
        "cta": {"label": "Admin-Aufgaben", "action": "open_tasks", "payload": {"category": "Administratives"}},
    },
    {
        "template_id": "de_task_completed_admin_04",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "dry",
        "face": "thinking",
        "category_tags": ["Administratives"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Ordnung ist ein Muskel. Du trainierst gerade.",
        "body_md": "Mini-Intervention: Lege **einen** Ablage-Ort fest (digital oder Papier). Ein Ort. Nicht zehn. Gehirn liebt simpel.",
        "cta": {"label": "Ok", "action": "dismiss", "payload": {}},
    },

    # -------------------------
    # TASK_COMPLETED (micro) — Tagesstruktur (3)
    # -------------------------
    {
        "template_id": "de_task_completed_tagesstruktur_01",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "warm",
        "face": "smile",
        "category_tags": ["Tagesstruktur"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Routine: klein, aber mächtig.",
        "body_md": "Gut gemacht. Mini-Intervention: Hänge den nächsten Schritt an einen Trigger: **„Wenn Zähneputzen, dann 2 Minuten aufräumen.“**",
        "cta": {"label": "Weitere Struktur-Aufgaben", "action": "open_tasks", "payload": {"category": "Tagesstruktur"}},
    },
    {
        "template_id": "de_task_completed_tagesstruktur_02",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "dry",
        "face": "wink",
        "category_tags": ["Tagesstruktur"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Du baust gerade dein „Morgen-Ich“.",
        "body_md": "Mini-Upgrade: Stelle dir **eine** Sache bereit (Kleidung, Tasche, Notiz). Vorbereitung ist Motivation ohne Drama.",
        "cta": {"label": "Ok", "action": "dismiss", "payload": {}},
    },
    {
        "template_id": "de_task_completed_tagesstruktur_03",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "tough_love",
        "face": "stern",
        "category_tags": ["Tagesstruktur"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Struktur heißt: weniger diskutieren, mehr tun.",
        "body_md": "Mini-Intervention: Setz **einen** Timer auf 5 Minuten und beginne. Danach darfst du neu entscheiden. Aber erst danach.",
        "cta": {"label": "Struktur-Aufgaben", "action": "open_tasks", "payload": {"category": "Tagesstruktur"}},
    },

    # -------------------------
    # TASK_COMPLETED (micro) — Familie & Freunde (2)
    # -------------------------
    {
        "template_id": "de_task_completed_family_01",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "warm",
        "face": "smile",
        "category_tags": ["Familie & Freunde"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Sozial investieren. Gute Rendite.",
        "body_md": "Schön. Mini-Intervention: Schreib **einen** Satz dazu, was dir daran gutgetan hat. Beziehungspflege ist ein Skill.",
        "cta": {"label": "Notiz öffnen", "action": "open_journal", "payload": {}},
    },
    {
        "template_id": "de_task_completed_family_02",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "dry",
        "face": "wink",
        "category_tags": ["Familie & Freunde"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Kontakt gehalten. Stabil.",
        "body_md": "Mini-Upgrade: Leg dir eine **„1-Minute-Message“** zurecht – kurz, ehrlich, ohne Roman. Konstanz schlägt Perfektion.",
        "cta": {"label": "Familie & Freunde", "action": "open_tasks", "payload": {"category": "Familie & Freunde"}},
    },

    # -------------------------
    # TASK_COMPLETED (micro) — Drogen (1)  [safe, motivational, no instructions for wrongdoing]
    # -------------------------
    {
        "template_id": "de_task_completed_drogen_01",
        "trigger": "TASK_COMPLETED",
        "severity": "micro",
        "tone": "warm",
        "face": "smile",
        "category_tags": ["Drogen"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Guter Schritt. Wirklich.",
        "body_md": "Mini-Intervention: Notier **einen** Trigger und **eine** Alternative (z. B. Wasser + kurzer Spaziergang). Plan schlägt Impuls.",
        "cta": {"label": "Notiz öffnen", "action": "open_journal", "payload": {}},
    },

    # -------------------------
    # CHECK_IN_SAVED (micro) — general + category flavored (5)
    # -------------------------
    {
        "template_id": "de_checkin_saved_general_01",
        "trigger": "CHECK_IN_SAVED",
        "severity": "micro",
        "tone": "dry",
        "face": "thinking",
        "category_tags": [],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Check-in gemacht. Gehirn entknotet.",
        "body_md": "Mini-Intervention: **10 Atemzüge**. Nicht „meditieren“. Nur zählen. Danach ist der Kopf oft 5% weniger laut.",
        "cta": {"label": "Ok", "action": "dismiss", "payload": {}},
    },
    {
        "template_id": "de_checkin_saved_general_02",
        "trigger": "CHECK_IN_SAVED",
        "severity": "micro",
        "tone": "warm",
        "face": "smile",
        "category_tags": [],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Du hast hingeschaut. Das zählt.",
        "body_md": "Mini-Intervention: Formuliere **einen** Satz: *„Heute brauche ich…“* (z. B. Ruhe, Struktur, Kontakt). Klarheit macht handlungsfähig.",
        "cta": {"label": "Notiz öffnen", "action": "open_journal", "payload": {}},
    },
    {
        "template_id": "de_checkin_saved_tagesstruktur_01",
        "trigger": "CHECK_IN_SAVED",
        "severity": "micro",
        "tone": "tough_love",
        "face": "stern",
        "category_tags": ["Tagesstruktur"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Jetzt kommt der entscheidende Teil.",
        "body_md": "Du hast reflektiert. Nächster Mini‑Move: **eine** Aufgabe so klein machen, dass du sie *nicht* ablehnen kannst (2 Minuten).",
        "cta": {"label": "Struktur-Aufgaben", "action": "open_tasks", "payload": {"category": "Tagesstruktur"}},
    },
    {
        "template_id": "de_checkin_saved_drogen_01",
        "trigger": "CHECK_IN_SAVED",
        "severity": "micro",
        "tone": "warm",
        "face": "thinking",
        "category_tags": ["Drogen"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Check-in ist ein Schutzfaktor.",
        "body_md": "Mini-Intervention: **„Urge-Surfing light“**: Drang kommt, Drang geht. 90 Sekunden beobachten, ohne zu handeln. Du trainierst Freiheit.",
        "cta": {"label": "Ok", "action": "dismiss", "payload": {}},
    },
    {
        "template_id": "de_checkin_saved_family_01",
        "trigger": "CHECK_IN_SAVED",
        "severity": "micro",
        "tone": "dry",
        "face": "wink",
        "category_tags": ["Familie & Freunde"],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Gefühle registriert. Nicht schlecht.",
        "body_md": "Mini-Intervention: Schick **eine** kurze, echte Nachricht an jemanden Safe: *„Dachte gerade an dich.“* Ohne Erwartung. Nur Kontakt.",
        "cta": {"label": "Familie & Freunde", "action": "open_tasks", "payload": {"category": "Familie & Freunde"}},
    },

    # -------------------------
    # OVERDUE (nudge) — 4 (category-aware but safe)
    # -------------------------
    {
        "template_id": "de_overdue_general_01",
        "trigger": "OVERDUE",
        "severity": "nudge",
        "tone": "tough_love",
        "face": "stern",
        "category_tags": [],
        "quadrant_tags": ["U+I"],
        "weight": 1,
        "title": "Überfällig heißt: dein Gehirn zahlt Zinsen.",
        "body_md": (
            "Nicht dramatisieren, **entscheiden**:\n"
            "- **5 Minuten starten** (nur Einstieg)\n"
            "- oder **verschieben** mit neuem Datum\n"
            "- oder **löschen**, wenn’s nicht mehr zählt\n\n"
            "Hauptsache: kein stilles „Ich sollte…“."
        ),
        "cta": {"label": "Offene Aufgaben", "action": "open_tasks", "payload": {"filter": "overdue"}},
    },
    {
        "template_id": "de_overdue_stellensuche_01",
        "trigger": "OVERDUE",
        "severity": "nudge",
        "tone": "dry",
        "face": "thinking",
        "category_tags": ["Stellensuche"],
        "quadrant_tags": ["U+I"],
        "weight": 1,
        "title": "Stellensuche mag Tempo, nicht Perfektion.",
        "body_md": "Wähle **eine** Aktion: 10 Minuten an der nächsten Bewerbung – oder 2 Minuten fürs Nachfassen. Beides zählt. Stillstand zählt nicht.",
        "cta": {
            "label": "Stellensuche öffnen",
            "action": "open_tasks",
            "payload": {"category": "Stellensuche", "filter": "overdue"},
        },
    },
    {
        "template_id": "de_overdue_admin_01",
        "trigger": "OVERDUE",
        "severity": "nudge",
        "tone": "tough_love",
        "face": "stern",
        "category_tags": ["Administratives"],
        "quadrant_tags": ["U+I"],
        "weight": 1,
        "title": "Admin-Overdue frisst Energie im Hintergrund.",
        "body_md": "Deal: **7 Minuten** heute. Nur das. Danach darfst du aufhören. Aber du startest. Das ist der Hebel.",
        "cta": {
            "label": "Admin öffnen",
            "action": "open_tasks",
            "payload": {"category": "Administratives", "filter": "overdue"},
        },
    },
    {
        "template_id": "de_overdue_tagesstruktur_01",
        "trigger": "OVERDUE",
        "severity": "nudge",
        "tone": "warm",
        "face": "thinking",
        "category_tags": ["Tagesstruktur"],
        "quadrant_tags": ["U+I"],
        "weight": 1,
        "title": "Struktur überfällig? Dann klein anfangen.",
        "body_md": "Mini-Plan: **eine** Routine heute (2 Minuten). Beispiel: Bett machen, 1 Glas Wasser, 1 Fenster auf. Nicht perfekt – **konsistent**.",
        "cta": {
            "label": "Tagesstruktur",
            "action": "open_tasks",
            "payload": {"category": "Tagesstruktur", "filter": "overdue"},
        },
    },

    # -------------------------
    # DEADLINE_SOON (nudge) — 3
    # -------------------------
    {
        "template_id": "de_deadline_soon_general_01",
        "trigger": "DEADLINE_SOON",
        "severity": "nudge",
        "tone": "tough_love",
        "face": "stern",
        "category_tags": [],
        "quadrant_tags": ["U+I"],
        "weight": 1,
        "title": "Deadline in Sicht. Jetzt zählt Führung.",
        "body_md": "Triff eine Entscheidung: **Heute 15 Minuten** Fokusblock – oder bewusst verschieben. Das Schlimmste ist „irgendwie im Kopf behalten“.",
        "cta": {"label": "Fällige Aufgaben", "action": "open_tasks", "payload": {"filter": "due_soon"}},
    },
    {
        "template_id": "de_deadline_soon_stellensuche_01",
        "trigger": "DEADLINE_SOON",
        "severity": "nudge",
        "tone": "dry",
        "face": "thinking",
        "category_tags": ["Stellensuche"],
        "quadrant_tags": ["U+I"],
        "weight": 1,
        "title": "Das Bewerbungslimit ist nicht dein Talent, sondern dein Timing.",
        "body_md": "Heute nur der Einstieg: Dokument öffnen → 1 Satz ändern → speichern. Das ist der „Start-Hebel“.",
        "cta": {
            "label": "Stellensuche",
            "action": "open_tasks",
            "payload": {"category": "Stellensuche", "filter": "due_soon"},
        },
    },
    {
        "template_id": "de_deadline_soon_admin_01",
        "trigger": "DEADLINE_SOON",
        "severity": "nudge",
        "tone": "warm",
        "face": "stern",
        "category_tags": ["Administratives"],
        "quadrant_tags": ["U+I"],
        "weight": 1,
        "title": "Admin-Deadline: kurz nervig, lang erleichternd.",
        "body_md": "Mach’s dir leicht: **Unterlagen sammeln** (5 Minuten) ist oft 80% des Starts. Dann erst „bearbeiten“.",
        "cta": {
            "label": "Administratives",
            "action": "open_tasks",
            "payload": {"category": "Administratives", "filter": "due_soon"},
        },
    },

    # -------------------------
    # STREAK_MILESTONE (milestone) — 2
    # -------------------------
    {
        "template_id": "de_streak_3_milestone_01",
        "trigger": "STREAK_MILESTONE",
        "severity": "milestone",
        "tone": "warm",
        "face": "smile",
        "category_tags": [],
        "quadrant_tags": [],
        "weight": 1,
        "title": "3 Tage Streak. Das ist ein System-Anfang.",
        "body_md": (
            "Das ist nicht „Laune“. Das ist **Wiederholung**.\n\n"
            "Mini-Challenge für morgen:\n"
            "**Wenn** du die App öffnest, **dann** erledigst du zuerst eine *2‑Minuten‑Aufgabe*.\n\n"
            "Du baust gerade Vertrauen in dich selbst."
        ),
        "cta": {"label": "Aufgaben öffnen", "action": "open_tasks", "payload": {"filter": "quick_win"}},
    },
    {
        "template_id": "de_streak_7_milestone_01",
        "trigger": "STREAK_MILESTONE",
        "severity": "milestone",
        "tone": "dry",
        "face": "wink",
        "category_tags": [],
        "quadrant_tags": [],
        "weight": 1,
        "title": "7 Tage. Das ist nicht Motivation – das ist Führung.",
        "body_md": (
            "Dein Gehirn mag Routine, auch wenn es’s nicht zugibt.\n\n"
            "Pro-Tipp: Plane für morgen **eine** Reibungsstelle weg (bereitlegen, vormerken, 1 Klick weniger).\n"
            "Klein ist nicht lächerlich. Klein ist **machbar**."
        ),
        "cta": {"label": "Ok", "action": "dismiss", "payload": {}},
    },

    # -------------------------
    # DAILY_GOAL_REACHED (milestone) — 1
    # -------------------------
    {
        "template_id": "de_daily_goal_reached_01",
        "trigger": "DAILY_GOAL_REACHED",
        "severity": "milestone",
        "tone": "tough_love",
        "face": "smile",
        "category_tags": [],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Tagesziel erreicht. Jetzt bitte nicht überziehen.",
        "body_md": (
            "Erledigt ist erledigt. Das ist der Punkt.\n\n"
            "Mini-Intervention: **Stop‑Signal**. Sag dir laut: *„Für heute reicht’s.“*\n"
            "Dann: etwas Kleines, das dich reguliert (Wasser, frische Luft, 3 Minuten bewegen)."
        ),
        "cta": {"label": "Ok", "action": "dismiss", "payload": {}},
    },

    # -------------------------
    # WEEKLY_REVIEW_READY (weekly) — 1 (fallback template)
    # -------------------------
    {
        "template_id": "de_weekly_review_ready_01",
        "trigger": "WEEKLY_REVIEW_READY",
        "severity": "weekly",
        "tone": "warm",
        "face": "thinking",
        "category_tags": [],
        "quadrant_tags": [],
        "weight": 1,
        "title": "Wochen-Check: kurz ehrlich, dann leichter.",
        "body_md": (
            "**Highlights (wähle 1–2):**\n"
            "- Was hast du diese Woche *trotzdem* geschafft?\n"
            "- Wo warst du konsequent?\n\n"
            "**Risiko:**\n"
            "- Welche Sache hängt dir als „offen im Kopf“ nach?\n\n"
            "**Fokus nächste Woche (max 3):**\n"
            "- 1× Stellensuche\n"
            "- 1× Admin\n"
            "- 1× Tagesstruktur\n\n"
            "Kein Roman. Nur Führung."
        ),
        "cta": {"label": "Aufgaben öffnen", "action": "open_tasks", "payload": {"filter": "open"}},
    },
]
