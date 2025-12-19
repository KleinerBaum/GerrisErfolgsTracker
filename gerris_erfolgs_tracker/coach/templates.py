from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable

from gerris_erfolgs_tracker.coach.events import CoachEvent, CoachTrigger
from gerris_erfolgs_tracker.coach.models import CoachMessage


def _default_now(event: CoachEvent) -> datetime:
    created_at = event.created_at
    if created_at.tzinfo is None:
        return created_at
    return created_at.astimezone(created_at.tzinfo)


class _SafeContext(dict):
    def __missing__(self, key: str) -> str:  # pragma: no cover - defensive
        return ""


@dataclass(frozen=True)
class TemplateEntry:
    trigger: CoachTrigger
    title: str
    body: str
    category_tags: tuple[str, ...]
    tone_tags: tuple[str, ...]
    severity: str = "default"

    def render(self, event: CoachEvent) -> CoachMessage:
        ctx = {
            "task_title": event.get_context_value("task_title") or "Aufgabe",
            "due_date": event.get_context_value("due_date") or "bald",
            "quadrant": event.get_context_value("quadrant") or "",
            "category": event.get_context_value("category") or "",
            "streak": event.get_context_value("streak") or "",
            "done_today": event.get_context_value("done_today") or "",
        }
        formatted_title = self.title.format_map(_SafeContext(ctx))
        formatted_body = self.body.format_map(_SafeContext(ctx))

        serialized_context = {key: (str(value) if value is not None else None) for key, value in event.context.items()}
        template_context = {
            "category_tags": ",".join(self.category_tags),
            "tone_tags": ",".join(self.tone_tags),
            **serialized_context,
        }

        return CoachMessage(
            event_id=event.event_id,
            title=formatted_title,
            body=formatted_body,
            created_at=_default_now(event),
            trigger=event.trigger,
            severity=self.severity,
            context=template_context,
        )


def _choose_from_pool(pool: Iterable[TemplateEntry], event: CoachEvent) -> CoachMessage:
    entries = list(pool)
    if not entries:
        return CoachMessage(
            event_id=event.event_id,
            title="Coach Hinweis / Coach note",
            body="Standardhinweis / Default note",
            created_at=_default_now(event),
            trigger=event.trigger,
            context=event.context,
        )

    category = event.get_context_value("category")
    category_matches = [entry for entry in entries if category and category in entry.category_tags]
    candidates = category_matches or entries
    index = abs(hash(event.event_id)) % len(candidates)
    return candidates[index].render(event)


TASK_COMPLETED_TEMPLATES: list[TemplateEntry] = [
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🚀 Bewerbungs-Boost / 🚀 Application boost",
        body="Stellensuche: '{task_title}' abgehakt. Jede Bewerbung zählt! / Job search: '{task_title}' done. Every application counts!",
        category_tags=("job_search", "Stellensuche"),
        tone_tags=("fokussiert", "ermutigend"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="📬 Unterlagen perfekt / 📬 Documents ready",
        body="'{task_title}' erledigt – dein Profil wird schärfer. / '{task_title}' done – your profile just got sharper.",
        category_tags=("job_search", "Stellensuche"),
        tone_tags=("positiv", "prägnant"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🧭 Netzwerk gepflegt / 🧭 Network nurtured",
        body="Kontaktmission '{task_title}' abgeschlossen. Weiter so! / Networking task '{task_title}' finished. Keep it up!",
        category_tags=("job_search", "Stellensuche"),
        tone_tags=("locker", "kurz"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🧾 Ordnung geschafft / 🧾 Admin sorted",
        body="Papierkram '{task_title}' ist weg. Schaffe dir Luft. / Admin task '{task_title}' done. Breathing room unlocked.",
        category_tags=("admin", "Administratives"),
        tone_tags=("tough-love", "klar"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="✅ Formular-Freiheit / ✅ Form freedom",
        body="'{task_title}' erledigt – weniger Stress, mehr Fokus. / '{task_title}' done – less stress, more focus.",
        category_tags=("admin", "Administratives"),
        tone_tags=("leicht", "humor"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="💌 Familie im Blick / 💌 Family first",
        body="Zeit für '{task_title}' investiert. Beziehungen danken es dir. / You handled '{task_title}'. Relationships appreciate it.",
        category_tags=("friends_family", "Familie & Freunde"),
        tone_tags=("warm", "ermutigend"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🤝 Verbindung gestärkt / 🤝 Connection strengthened",
        body="'{task_title}' erledigt – ein Pluspunkt für Nähe. / '{task_title}' done – closeness level up.",
        category_tags=("friends_family", "Familie & Freunde"),
        tone_tags=("positiv", "kurz"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🛡️ Rückfall-Prophylaxe / 🛡️ Relapse shield",
        body="'{task_title}' abgeschlossen. Du hältst Kurs. / '{task_title}' finished. You're staying the course.",
        category_tags=("drugs", "Drogen"),
        tone_tags=("tough-love", "achtsam"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🚦 Trigger im Griff / 🚦 Triggers handled",
        body="'{task_title}' erledigt – klarer Kopf, klarer Weg. / '{task_title}' done – clear head, steady path.",
        category_tags=("drugs", "Drogen"),
        tone_tags=("respektvoll", "ermutigend"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="☀️ Struktur gewonnen / ☀️ Structure locked",
        body="Tagesstruktur: '{task_title}' abgehakt. Momentum wächst. / Daily structure: '{task_title}' done. Momentum is growing.",
        category_tags=("daily_structure", "Tagesstruktur"),
        tone_tags=("fokussiert", "kurz"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="⏳ Zeit klug genutzt / ⏳ Time well spent",
        body="'{task_title}' erledigt. Kleine Routinen, großer Effekt. / '{task_title}' done. Small routines, big effect.",
        category_tags=("daily_structure", "Tagesstruktur"),
        tone_tags=("positiv", "achtsam"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🎯 Klarer Treffer / 🎯 Direct hit",
        body="'{task_title}' abgeschlossen. Quadrant {quadrant} arbeitet für dich. / '{task_title}' finished. Quadrant {quadrant} is paying off.",
        category_tags=("general",),
        tone_tags=("fokussiert", "prägnant"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="👏 Sauber erledigt / 👏 Nicely done",
        body="Du hast '{task_title}' abgeschlossen. Weiter den Flow nutzen! / You completed '{task_title}'. Keep the flow going!",
        category_tags=("general",),
        tone_tags=("positiv", "locker"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="📈 Fortschritt sichtbar / 📈 Progress visible",
        body="'{task_title}' erledigt – dein Board wird leichter. / '{task_title}' done – your board just got lighter.",
        category_tags=("general",),
        tone_tags=("klar", "ermutigend"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🪄 Anschreiben geschliffen / 🪄 Cover letter polished",
        body="'{task_title}' verbessert. Recruiter merken die Sorgfalt. / '{task_title}' refined. Recruiters notice the care.",
        category_tags=("job_search", "Stellensuche"),
        tone_tags=("prägnant", "positiv"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🧪 Skill-Refresh / 🧪 Skill refresh",
        body="Training '{task_title}' abgeschlossen. Neues Argument für dein Profil! / Training '{task_title}' done. Fresh proof for your profile!",
        category_tags=("job_search", "Stellensuche"),
        tone_tags=("ermutigend", "fokussiert"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🗂️ Konto sortiert / 🗂️ Accounts sorted",
        body="Admin '{task_title}' erledigt. Ein To-do weniger, klarer Kopf mehr. / Admin '{task_title}' done. One less item, clearer head.",
        category_tags=("admin", "Administratives"),
        tone_tags=("klar", "positiv"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🔐 Sicherheit erhöht / 🔐 Security raised",
        body="'{task_title}' abgeschlossen. Ordnung schützt dich. / '{task_title}' finished. Order keeps you safe.",
        category_tags=("admin", "Administratives"),
        tone_tags=("tough-love", "kurz"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="💬 Gespräch geführt / 💬 Talk done",
        body="Familie & Freunde: '{task_title}' gemeistert. Verbindung stärkt dich. / Family & friends: '{task_title}' done. Connection strengthens you.",
        category_tags=("friends_family", "Familie & Freunde"),
        tone_tags=("warm", "anerkennung"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🎉 Gemeinsamer Moment / 🎉 Shared moment",
        body="'{task_title}' erlebt. Diese Erinnerungen tragen. / '{task_title}' shared. These memories carry you.",
        category_tags=("friends_family", "Familie & Freunde"),
        tone_tags=("humor", "positiv"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🛠️ Coping angewandt / 🛠️ Coping used",
        body="'{task_title}' umgesetzt. Starker Schritt gegen alte Muster. / '{task_title}' applied. Strong move against old patterns.",
        category_tags=("drugs", "Drogen"),
        tone_tags=("tough-love", "respektvoll"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🌙 Trigger entschärft / 🌙 Trigger defused",
        body="'{task_title}' erledigt. Du hast die Kontrolle behalten. / '{task_title}' done. You kept control.",
        category_tags=("drugs", "Drogen"),
        tone_tags=("achtsam", "ermutigend"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🍽️ Routine gehalten / 🍽️ Routine kept",
        body="'{task_title}' in deiner Tagesstruktur erledigt. Stabilität zahlt sich aus. / '{task_title}' done in your routine. Stability pays off.",
        category_tags=("daily_structure", "Tagesstruktur"),
        tone_tags=("positiv", "kleinschrittig"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🕒 Zeitfenster genutzt / 🕒 Time slot used",
        body="'{task_title}' abgeschlossen. Dein Kalender folgt dir. / '{task_title}' finished. Your calendar follows your lead.",
        category_tags=("daily_structure", "Tagesstruktur"),
        tone_tags=("fokussiert", "klar"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="📚 Wissen geteilt / 📚 Shared knowledge",
        body="'{task_title}' erledigt und notiert. Dein Future-You bedankt sich. / '{task_title}' done and documented. Future you says thanks.",
        category_tags=("general",),
        tone_tags=("reflektierend", "positiv"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🧠 Clever priorisiert / 🧠 Smart prioritization",
        body="'{task_title}' zuerst erledigt. Fokus zeigt Wirkung. / '{task_title}' first. Focus pays off.",
        category_tags=("general",),
        tone_tags=("tough-love", "kurz"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🧮 Bewerbungszahlen / 🧮 Application count",
        body="'{task_title}' erledigt – die Quote klettert. / '{task_title}' done – your numbers climb.",
        category_tags=("job_search", "Stellensuche"),
        tone_tags=("fokussiert", "positiv"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🗣️ Pitch geübt / 🗣️ Pitch practiced",
        body="'{task_title}' abgeschlossen. Dein Elevator-Pitch sitzt. / '{task_title}' done. Your elevator pitch is tighter.",
        category_tags=("job_search", "Stellensuche"),
        tone_tags=("ermutigend", "locker"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🧾 Ablage leer / 🧾 Inbox zero",
        body="'{task_title}' sortiert. Kopf frei für Wichtiges. / '{task_title}' sorted. Headspace unlocked.",
        category_tags=("admin", "Administratives"),
        tone_tags=("klar", "humor"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="📌 Termine bestätigt / 📌 Appointments confirmed",
        body="'{task_title}' erledigt. Plan steht, Stress sinkt. / '{task_title}' done. Plan set, stress drops.",
        category_tags=("admin", "Administratives"),
        tone_tags=("positiv", "prägnant"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🎧 Zugehört / 🎧 Listened well",
        body="'{task_title}' umgesetzt – du warst präsent. / '{task_title}' done – you were present.",
        category_tags=("friends_family", "Familie & Freunde"),
        tone_tags=("warm", "achtsam"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🎈 Kleine Geste / 🎈 Small gesture",
        body="'{task_title}' erledigt. Kleine Gesten, große Wirkung. / '{task_title}' done. Small gestures, big effect.",
        category_tags=("friends_family", "Familie & Freunde"),
        tone_tags=("humor", "positiv"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🚪 Rückzug verhindert / 🚪 Avoided retreat",
        body="'{task_title}' geschafft. Alte Muster bleiben draußen. / '{task_title}' done. Old patterns stay out.",
        category_tags=("drugs", "Drogen"),
        tone_tags=("tough-love", "klar"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🧘 Atem geholt / 🧘 Took a breath",
        body="'{task_title}' abgeschlossen. Du hast dir Ruhe gegönnt statt Impuls. / '{task_title}' done. You chose calm over impulse.",
        category_tags=("drugs", "Drogen"),
        tone_tags=("achtsam", "ermutigend"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🛏️ Abendroutine gehalten / 🛏️ Kept the evening routine",
        body="'{task_title}' erledigt. Guter Schlaf dank Struktur. / '{task_title}' done. Better sleep through structure.",
        category_tags=("daily_structure", "Tagesstruktur"),
        tone_tags=("positiv", "reflektierend"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🥗 Selfcare erledigt / 🥗 Self-care done",
        body="'{task_title}' abgehakt. Dein Körper merkt es zuerst. / '{task_title}' checked. Your body notices first.",
        category_tags=("daily_structure", "Tagesstruktur"),
        tone_tags=("warm", "achtsam"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🧭 Klarer Norden / 🧭 True north",
        body="'{task_title}' passt zu deinem Warum. Weiter so. / '{task_title}' fits your why. Keep going.",
        category_tags=("general",),
        tone_tags=("fokussiert", "kurz"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="📣 Mini-Sieg gefeiert / 📣 Mini win celebrated",
        body="'{task_title}' erledigt. Kurz freuen, dann nächsten Schritt wählen. / '{task_title}' done. Celebrate briefly, pick the next step.",
        category_tags=("general",),
        tone_tags=("humor", "positiv"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🪜 Schritt gesetzt / 🪜 Step taken",
        body="'{task_title}' erledigt. Schritt für Schritt zur Routine. / '{task_title}' done. Step by step into routine.",
        category_tags=("general",),
        tone_tags=("kleinschrittig", "ermutigend"),
    ),
]


OVERDUE_TEMPLATES: list[TemplateEntry] = [
    TemplateEntry(
        trigger=CoachTrigger.OVERDUE,
        title="⏰ Überfällig, aber machbar / ⏰ Overdue yet doable",
        body="'{task_title}' wartet seit {due_date}. Hol sie dir zurück. / '{task_title}' has waited since {due_date}. Reclaim it now.",
        category_tags=("general",),
        tone_tags=("tough-love", "kurz"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.OVERDUE,
        title="🔧 Aufschub stoppen / 🔧 Stop the delay",
        body="'{task_title}' rutscht nach. Ein klarer 25-Minuten-Slot reicht. / '{task_title}' slipped. A clear 25-minute slot will do.",
        category_tags=("general",),
        tone_tags=("fokussiert", "ermutigend"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.OVERDUE,
        title="📅 Termin überzogen / 📅 Deadline passed",
        body="'{task_title}' gehört wieder auf die Agenda. Mini-Schritt heute. / '{task_title}' back on the agenda. Take a mini-step today.",
        category_tags=("general",),
        tone_tags=("achtsam", "kurz"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.OVERDUE,
        title="🪜 Kleiner Einstieg / 🪜 Small start",
        body="Überfällig: '{task_title}'. 10 Minuten reichen, um Momentum zu bauen. / Overdue: '{task_title}'. Ten minutes can rebuild momentum.",
        category_tags=("daily_structure", "Tagesstruktur"),
        tone_tags=("positiv", "kleinschrittig"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.OVERDUE,
        title="📢 Familie wartet / 📢 Family waits",
        body="'{task_title}' für deine Liebsten schiebt sich. Hol den Termin nach. / '{task_title}' for your loved ones is slipping. Reschedule and act.",
        category_tags=("friends_family", "Familie & Freunde"),
        tone_tags=("warm", "bestärkend"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.OVERDUE,
        title="🛡️ Selbstschutz zuerst / 🛡️ Self-protection first",
        body="Überfällig im Bereich Drogen: '{task_title}'. Sofort einplanen, sicher bleiben. / Overdue in recovery: '{task_title}'. Schedule it now, stay safe.",
        category_tags=("drugs", "Drogen"),
        tone_tags=("respektvoll", "klar"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.OVERDUE,
        title="📈 Bewerbungsstapel / 📈 Application stack",
        body="'{task_title}' hängt. 1 konkreter Versand heute stoppt den Rückstand. / '{task_title}' is stuck. One concrete send today stops the backlog.",
        category_tags=("job_search", "Stellensuche"),
        tone_tags=("tough-love", "kurz"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.OVERDUE,
        title="🗂️ Admin nachholen / 🗂️ Catch up on admin",
        body="Papier '{task_title}' ist überzogen. 15 Minuten, dann ist Ruhe. / Admin '{task_title}' overdue. Fifteen minutes and it is quiet again.",
        category_tags=("admin", "Administratives"),
        tone_tags=("ermutigend", "prägnant"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.OVERDUE,
        title="🤹 Struktur retten / 🤹 Rescue the routine",
        body="'{task_title}' wartet. Ein klarer Slot bringt deinen Rhythmus zurück. / '{task_title}' waits. A clear slot restores your rhythm.",
        category_tags=("daily_structure", "Tagesstruktur"),
        tone_tags=("positiv", "fokussiert"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.OVERDUE,
        title="🧭 Dranbleiben / 🧭 Stay on track",
        body="Überfällig heißt nicht verloren. '{task_title}' heute anstoßen. / Overdue isn't lost. Kick off '{task_title}' today.",
        category_tags=("general",),
        tone_tags=("ermutigend", "kurz"),
    ),
]


DUE_SOON_TEMPLATES: list[TemplateEntry] = [
    TemplateEntry(
        trigger=CoachTrigger.DUE_SOON,
        title="👀 Deadline im Blick / 👀 Deadline ahead",
        body="'{task_title}' steht an ({due_date}). Block dir 30 Minuten. / '{task_title}' is coming ({due_date}). Block 30 minutes for it.",
        category_tags=("general",),
        tone_tags=("fokussiert", "klar"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.DUE_SOON,
        title="⏱️ Bald fällig / ⏱️ Due shortly",
        body="'{task_title}' nähert sich. Ein kleiner Vorab-Schritt entspannt morgen. / '{task_title}' is near. A small pre-step calms tomorrow.",
        category_tags=("general",),
        tone_tags=("achtsam", "kurz"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.DUE_SOON,
        title="🤝 Termin mit Familie / 🤝 Date with family",
        body="'{task_title}' steht an ({due_date}). Plane etwas Puffer fürs Gespräch. / '{task_title}' coming up ({due_date}). Add buffer for the conversation.",
        category_tags=("friends_family", "Familie & Freunde"),
        tone_tags=("warm", "planend"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.DUE_SOON,
        title="🧾 Frist im Amt / 🧾 Admin deadline",
        body="'{task_title}' bald fällig. Dokumente bereit legen. / '{task_title}' due soon. Prep the documents now.",
        category_tags=("admin", "Administratives"),
        tone_tags=("klar", "prägnant"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.DUE_SOON,
        title="🎙️ Bewerbung auf Sendung / 🎙️ Application soon",
        body="'{task_title}' nähert sich. Feinschliff heute spart Stress. / '{task_title}' approaching. Polish today, less stress later.",
        category_tags=("job_search", "Stellensuche"),
        tone_tags=("fokussiert", "ermutigend"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.DUE_SOON,
        title="🛡️ Schutztermin / 🛡️ Safety slot",
        body="'{task_title}' kommt ({due_date}). Plane Support, bleib stabil. / '{task_title}' due ({due_date}). Plan support, stay steady.",
        category_tags=("drugs", "Drogen"),
        tone_tags=("respektvoll", "achtsam"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.DUE_SOON,
        title="🌅 Morgenroutine sichern / 🌅 Secure the routine",
        body="'{task_title}' bald fällig. Setz einen festen Slot morgen früh. / '{task_title}' due soon. Lock a morning slot.",
        category_tags=("daily_structure", "Tagesstruktur"),
        tone_tags=("positiv", "planend"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.DUE_SOON,
        title="📌 Kleine Vorbereitung / 📌 Quick prep",
        body="'{task_title}' nähert sich. Material jetzt bereitlegen. / '{task_title}' is near. Lay out materials now.",
        category_tags=("general",),
        tone_tags=("kurz", "konkret"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.DUE_SOON,
        title="🔍 Quadrant prüfen / 🔍 Check the quadrant",
        body="Bald fällig: '{task_title}'. Passt Quadrant {quadrant}? / Due soon: '{task_title}'. Still fits quadrant {quadrant}?",
        category_tags=("general",),
        tone_tags=("reflektierend", "prägnant"),
    ),
    TemplateEntry(
        trigger=CoachTrigger.DUE_SOON,
        title="🏁 Fertig werden / 🏁 Finish line",
        body="'{task_title}' steht an ({due_date}). Letzter Feinschliff heute. / '{task_title}' due ({due_date}). Final polish today.",
        category_tags=("general",),
        tone_tags=("ermutigend", "fokussiert"),
    ),
]


STREAK_TEMPLATES: list[TemplateEntry] = [
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🔥 Streak 3 erreicht / 🔥 Streak at 3",
        body="Drei Tage in Folge! '{task_title}' war der Zündfunke. / Three days straight! '{task_title}' was the spark.",
        category_tags=("general",),
        tone_tags=("positiv", "kurz"),
        severity="milestone",
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🌟 Sieben-Tage-Serie / 🌟 Seven-day run",
        body="Streak 7! Momentum fühlt sich gut an – halte es leicht. / Seven-day streak! Momentum feels great – keep it light.",
        category_tags=("general",),
        tone_tags=("ermutigend", "achtsam"),
        severity="milestone",
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🏅 Zwei Wochen durchgezogen / 🏅 Two weeks strong",
        body="14er-Streak! '{task_title}' zeigt deine Konstanz. / 14-day streak! '{task_title}' shows your consistency.",
        category_tags=("general",),
        tone_tags=("fokussiert", "positiv"),
        severity="milestone",
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🎖️ 30-Tage-Meilenstein / 🎖️ 30-day milestone",
        body="30 Tage drangeblieben – beeindruckend. Mini-Feier erlaubt! / Thirty days on track – impressive. Mini celebration allowed!",
        category_tags=("general",),
        tone_tags=("humor", "anerkennung"),
        severity="milestone",
    ),
]


DAILY_GOAL_TEMPLATES: list[TemplateEntry] = [
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🎯 Tagesziel geknackt / 🎯 Daily goal hit",
        body="Ziel erreicht! '{task_title}' war der entscheidende Schritt. / Goal hit! '{task_title}' sealed the deal.",
        category_tags=("general",),
        tone_tags=("positiv", "kurz"),
        severity="milestone",
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="📊 Über Soll / 📊 Above target",
        body="Du hast das Tagesziel überschritten. Gönn dir eine Pause. / You surpassed today's target. Take a breather.",
        category_tags=("general",),
        tone_tags=("achtsam", "ermutigend"),
        severity="milestone",
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="💡 Clevere Planung / 💡 Smart planning",
        body="Mit '{task_title}' hast du das Ziel früh geknackt. Freiraum nutzen! / '{task_title}' cracked the goal early. Use the free time well!",
        category_tags=("general",),
        tone_tags=("locker", "positiv"),
        severity="milestone",
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🏆 Punktlandung / 🏆 Perfect landing",
        body="Tagesziel erreicht, ohne Hektik. Genau so geht's. / Daily goal reached without rush. That's the way.",
        category_tags=("general",),
        tone_tags=("fokussiert", "klar"),
        severity="milestone",
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🌟 Bonus geschafft / 🌟 Bonus achieved",
        body="Ziel plus Bonus: '{task_title}' oben drauf. Stark. / Goal plus bonus: '{task_title}' on top. Strong work.",
        category_tags=("general",),
        tone_tags=("positiv", "locker"),
        severity="milestone",
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🧘 Ausgeglichen / 🧘 Balanced",
        body="Ziel erreicht mit Pausen – gute Selbstfürsorge. / Goal hit with breaks – solid self-care.",
        category_tags=("general",),
        tone_tags=("achtsam", "ermutigend"),
        severity="milestone",
    ),
    TemplateEntry(
        trigger=CoachTrigger.TASK_COMPLETED,
        title="🛠️ System hat funktioniert / 🛠️ System worked",
        body="Struktur + Fokus = Ziel erreicht. Muster wiederholen! / Structure + focus = goal reached. Repeat the pattern!",
        category_tags=("general",),
        tone_tags=("tough-love", "klar"),
        severity="milestone",
    ),
]


WEEKLY_TEMPLATES: list[TemplateEntry] = [
    TemplateEntry(
        trigger=CoachTrigger.WEEKLY,
        title="🔁 Wochenrückblick bereit / 🔁 Weekly review ready",
        body="Zeit für Review & Planung. Kurz festhalten, was lief – und was nächste Woche gewinnt. / Time for review & planning. Capture wins and pick next week's focus.",
        category_tags=("general",),
        tone_tags=("reflektierend", "klar"),
        severity="weekly",
    ),
    TemplateEntry(
        trigger=CoachTrigger.WEEKLY,
        title="🧭 Kompass justieren / 🧭 Adjust the compass",
        body="Starte den Wochencheck: Highlights, Lowlights, nächster Kurs. / Start the weekly check: highlights, lowlights, next heading.",
        category_tags=("general",),
        tone_tags=("fokussiert", "prägnant"),
        severity="weekly",
    ),
    TemplateEntry(
        trigger=CoachTrigger.WEEKLY,
        title="📓 Lernliste öffnen / 📓 Open the learning log",
        body="Kurzer Rückblick schärft deine nächsten Schritte. Drei Notizen reichen. / A short review sharpens your next steps. Three notes are enough.",
        category_tags=("general",),
        tone_tags=("ermutigend", "kurz"),
        severity="weekly",
    ),
    TemplateEntry(
        trigger=CoachTrigger.WEEKLY,
        title="🎨 Woche kuratieren / 🎨 Curate the week",
        body="Was hat Energie gebracht? Was lenkte ab? Schreib es auf, plane schlau. / What gave energy? What distracted? Write it down, plan smart.",
        category_tags=("general",),
        tone_tags=("reflektierend", "achtsam"),
        severity="weekly",
    ),
    TemplateEntry(
        trigger=CoachTrigger.WEEKLY,
        title="🚦 Fokus erneuern / 🚦 Renew focus",
        body="Wöchentlicher Check: drei Ziele setzen, ein Risiko eliminieren. / Weekly check: set three targets, remove one risk.",
        category_tags=("general",),
        tone_tags=("tough-love", "klar"),
        severity="weekly",
    ),
    TemplateEntry(
        trigger=CoachTrigger.WEEKLY,
        title="🌱 Mini-Meilensteine / 🌱 Mini milestones",
        body="Plane 3 kleine Schritte für nächste Woche. Start mit dem leichtesten. / Plan three small steps for next week. Start with the lightest.",
        category_tags=("general",),
        tone_tags=("positiv", "kleinschrittig"),
        severity="weekly",
    ),
    TemplateEntry(
        trigger=CoachTrigger.WEEKLY,
        title="🏁 Abschluss & Ausblick / 🏁 Close & preview",
        body="Review anstoßen: Wins feiern, offene Punkte priorisieren. / Kick off the review: celebrate wins, prioritize the rest.",
        category_tags=("general",),
        tone_tags=("ermutigend", "kurz"),
        severity="weekly",
    ),
    TemplateEntry(
        trigger=CoachTrigger.WEEKLY,
        title="🧹 Wochen-Aufräumen / 🧹 Weekly clean-up",
        body="Kalender checken, Aufgaben sortieren, Fokus setzen. Fünf Minuten reichen. / Check calendar, sort tasks, set focus. Five minutes are enough.",
        category_tags=("general",),
        tone_tags=("locker", "prägnant"),
        severity="weekly",
    ),
    TemplateEntry(
        trigger=CoachTrigger.WEEKLY,
        title="🎛️ Fokus-Switch / 🎛️ Focus switch",
        body="Was streichst du diese Woche? Mutig priorisieren. / What will you drop this week? Prioritize boldly.",
        category_tags=("general",),
        tone_tags=("tough-love", "klar"),
        severity="weekly",
    ),
    TemplateEntry(
        trigger=CoachTrigger.WEEKLY,
        title="🧩 Woche puzzeln / 🧩 Assemble the week",
        body="Setze Termine, Energielevel und Pausen passend zusammen. / Match appointments, energy, and breaks wisely.",
        category_tags=("general",),
        tone_tags=("achtsam", "planend"),
        severity="weekly",
    ),
    TemplateEntry(
        trigger=CoachTrigger.WEEKLY,
        title="🔍 Lernmoment / 🔍 Learning moment",
        body="Notiere 1 Learning, 1 Erfolg, 1 Experiment für nächste Woche. / Write 1 learning, 1 win, 1 experiment for next week.",
        category_tags=("general",),
        tone_tags=("reflektierend", "kurz"),
        severity="weekly",
    ),
]


def select_template(event: CoachEvent) -> CoachMessage:
    if event.trigger is CoachTrigger.TASK_COMPLETED:
        return _choose_from_pool(TASK_COMPLETED_TEMPLATES + STREAK_TEMPLATES + DAILY_GOAL_TEMPLATES, event)
    if event.trigger is CoachTrigger.OVERDUE:
        return _choose_from_pool(OVERDUE_TEMPLATES, event)
    if event.trigger is CoachTrigger.DUE_SOON:
        return _choose_from_pool(DUE_SOON_TEMPLATES, event)
    if event.trigger is CoachTrigger.WEEKLY:
        return _choose_from_pool(WEEKLY_TEMPLATES, event)
    return _choose_from_pool(TASK_COMPLETED_TEMPLATES, event)


__all__ = ["select_template"]
