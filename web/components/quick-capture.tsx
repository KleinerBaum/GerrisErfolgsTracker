"use client";

import { useEffect, useRef, useState } from "react";

import { LIFE_AREA_LABELS, type CaptureDraft, type CaptureKind, type LifeArea } from "../lib/domain/types";
import { CloseIcon, MicIcon } from "./icons";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const KIND_LABELS: Record<CaptureKind, string> = {
  task: "Aufgabe",
  event: "Termin",
  note: "Notiz",
  contact: "Kontakt",
  contract: "Vertrag",
};

type QuickCaptureProps = {
  open: boolean;
  onClose: () => void;
  onSave: (draft: CaptureDraft) => void;
};

export function QuickCapture({ open, onClose, onSave }: QuickCaptureProps) {
  const [kind, setKind] = useState<CaptureKind>("task");
  const [area, setArea] = useState<LifeArea>("projects");
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  if (!open) return null;

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "de-DE";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setText((current) => `${current} ${transcript}`.trim());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const save = () => {
    if (!text.trim()) return;
    onSave({ kind, text: text.trim(), area });
    setText("");
    setKind("task");
    onClose();
  };

  return (
    <div className="sheet-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="capture-title"
        aria-modal="true"
        className="bottom-sheet"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div>
            <span className="eyebrow">Schnellerfassung</span>
            <h2 id="capture-title">Neu erfassen</h2>
          </div>
          <button aria-label="Schnellerfassung schließen" className="icon-button" onClick={onClose} type="button">
            <CloseIcon />
          </button>
        </div>

        <fieldset className="chip-fieldset">
          <legend>Art des Eintrags</legend>
          <div className="chip-selector">
            {(Object.keys(KIND_LABELS) as CaptureKind[]).map((value) => (
              <button
                aria-pressed={kind === value}
                className={kind === value ? "active" : ""}
                key={value}
                onClick={() => setKind(value)}
                type="button"
              >
                {KIND_LABELS[value]}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field-label" htmlFor="capture-text">
          Was möchtest du festhalten?
        </label>
        <div className="capture-input-wrap">
          <textarea
            id="capture-text"
            onChange={(event) => setText(event.target.value)}
            placeholder="z. B. Portfolio-Review Freitag um 14 Uhr"
            ref={inputRef}
            rows={3}
            value={text}
          />
          <button
            aria-label={listening ? "Spracheingabe läuft" : "Spracheingabe starten"}
            className={`voice-button ${listening ? "listening" : ""}`}
            disabled={listening}
            onClick={startVoice}
            type="button"
          >
            <MicIcon /> {listening ? "Ich höre zu …" : "Sprechen"}
          </button>
        </div>

        <label className="field-label" htmlFor="capture-area">
          Bereich
        </label>
        <select id="capture-area" onChange={(event) => setArea(event.target.value as LifeArea)} value={area}>
          {(Object.keys(LIFE_AREA_LABELS) as LifeArea[]).map((value) => (
            <option key={value} value={value}>
              {LIFE_AREA_LABELS[value]}
            </option>
          ))}
        </select>

        <p className="trust-copy">Der Eintrag wird zuerst als Entwurf gespeichert. Externe Änderungen brauchen deine Freigabe.</p>
        <button className="button button-primary button-full" disabled={!text.trim()} onClick={save} type="button">
          Speichern
        </button>
      </section>
    </div>
  );
}
