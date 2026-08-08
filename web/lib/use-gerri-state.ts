"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { COST_CATEGORIES, normalizeAccountBalances } from "./finance-data";
import { mergeApplicationResearch } from "./application-research";
import { normalizeApplicationKpiSettings } from "./application-workflow";
import { diaryRhythmDays, normalizeDiaryEntries } from "./diary";
import { normalizeDashboardSettings } from "./dashboard";
import { isoDateInput } from "./format";
import { ledgerTotals, normalizeGamificationState } from "./gamification";
import { normalizeMasterCvContent } from "./master-cv";
import type { AppState, CostCategory, SyncStatus } from "./types";

const STORAGE_KEY = "gerris-kompass-state-v1";

const isAppState = (value: unknown): value is AppState => {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AppState>;
  return (
    state.schemaVersion === 1 &&
    Array.isArray(state.tasks) &&
    Array.isArray(state.costs) &&
    Array.isArray(state.documents) &&
    Array.isArray(state.calendarEvents) &&
    Array.isArray(state.journal)
  );
};

const finiteOrZero = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

function normalizeState(value: AppState): AppState {
  const candidate = value as AppState & {
    incomes?: AppState["incomes"];
    accountBalances?: Partial<AppState["accountBalances"]>;
    pendingTaskImports?: AppState["pendingTaskImports"];
    dashboardSettings?: AppState["dashboardSettings"];
    applicationKpiSettings?: AppState["applicationKpiSettings"];
  };
  const journal = normalizeDiaryEntries(candidate.journal);
  const gamification = normalizeGamificationState(
    candidate.gamification,
    finiteOrZero(candidate.points),
    candidate.updatedAt,
  );
  return {
    ...candidate,
    pendingTaskImports: Array.isArray(candidate.pendingTaskImports)
      ? candidate.pendingTaskImports
      : [],
    costs: candidate.costs.map((cost) => {
      const legacyCategory =
        (cost.category as string) === "Alltag"
          ? "Lebensmittel & Haushalt"
          : cost.category;
      const category = COST_CATEGORIES.includes(
        legacyCategory as CostCategory,
      )
        ? (legacyCategory as CostCategory)
        : "Sonstiges";
      return { ...cost, category };
    }),
    incomes: Array.isArray(candidate.incomes) ? candidate.incomes : [],
    accountBalances: normalizeAccountBalances(candidate.accountBalances),
    applications: mergeApplicationResearch(candidate.applications),
    contacts: Array.isArray(candidate.contacts) ? candidate.contacts : [],
    dashboardSettings: normalizeDashboardSettings(
      candidate.dashboardSettings,
      candidate.monthlyBudget,
    ),
    applicationKpiSettings: normalizeApplicationKpiSettings(
      candidate.applicationKpiSettings,
    ),
    masterCvDocumentId:
      typeof candidate.masterCvDocumentId === "string"
        ? candidate.masterCvDocumentId
        : null,
    careerPassportDocumentId:
      typeof candidate.careerPassportDocumentId === "string"
        ? candidate.careerPassportDocumentId
        : null,
    masterCvContent: normalizeMasterCvContent(candidate.masterCvContent),
    journal,
    gamification,
    points: ledgerTotals(gamification.ledger).balanceXp,
    rhythmDays: diaryRhythmDays(journal, isoDateInput()),
  };
}

function readLocalState(): AppState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isAppState(parsed) ? normalizeState(parsed) : null;
  } catch {
    return null;
  }
}

function stateForPersistence(state: AppState): AppState {
  return {
    ...state,
    tasks: state.tasks.filter((task) => !task.taskListId),
  };
}

function writeLocalState(state: AppState) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(stateForPersistence(state)),
    );
  } catch {
    // Der private Server-Speicher bleibt die führende Quelle.
  }
}

export function useGerriState(initialState: AppState) {
  const [state, setState] = useState(() => normalizeState(initialState));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("lade");
  const [persistedRevision, setPersistedRevision] = useState<number | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const remoteAvailable = useRef(false);
  const remoteRevision = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/state", {
          headers: { accept: "application/json" },
        });
        if (!active) return;
        if (response.ok && response.status !== 204) {
          const payload: unknown = await response.json();
          if (isAppState(payload)) {
            const normalized = normalizeState(payload);
            setState(normalized);
            writeLocalState(normalized);
            remoteAvailable.current = true;
            remoteRevision.current = normalized.revision;
            setPersistedRevision(normalized.revision);
            setSyncStatus("synchronisiert");
          }
        } else if (response.status === 204) {
          const local = readLocalState();
          if (local) setState(local);
          remoteAvailable.current = true;
          remoteRevision.current = 0;
          setPersistedRevision(0);
          setSyncStatus("synchronisiert");
        } else {
          const local = readLocalState();
          if (local) setState(local);
          setSyncStatus("lokal");
        }
      } catch {
        const local = readLocalState();
        if (local) setState(local);
        setSyncStatus("lokal");
      } finally {
        if (active) setReady(true);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeLocalState(state);
    if (remoteRevision.current === state.revision) return;
    const timer = window.setTimeout(async () => {
      try {
        const expected = remoteRevision.current ?? 0;
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "if-match": `"${expected}"`,
          },
          body: JSON.stringify(stateForPersistence(state)),
        });
        if (response.ok) {
          remoteAvailable.current = true;
          remoteRevision.current = state.revision;
          setPersistedRevision(state.revision);
          setSyncStatus("synchronisiert");
        } else if (response.status === 409) {
          setSyncStatus("konflikt");
        } else {
          setSyncStatus(remoteAvailable.current ? "fehler" : "lokal");
        }
      } catch {
        setSyncStatus(remoteAvailable.current ? "fehler" : "lokal");
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [ready, state]);

  const updateState = useCallback(
    (update: (current: AppState) => AppState) => {
      setState((current) => {
        const next = update(current);
        return {
          ...next,
          revision: current.revision + 1,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [],
  );

  const exportBackup = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gerris-kompass-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const importBackup = useCallback((raw: string) => {
    const parsed: unknown = JSON.parse(raw);
    if (!isAppState(parsed)) {
      throw new Error("Das Backup hat kein unterstütztes Format.");
    }
    const normalized = normalizeState(parsed);
    const pendingTaskImports = [
      ...(normalized.pendingTaskImports ?? []),
      ...normalized.tasks.filter((task) => !task.taskListId),
    ].filter(
      (task, index, tasks) =>
        tasks.findIndex((candidate) => candidate.id === task.id) === index,
    );
    setState((current) => ({
      ...normalized,
      pendingTaskImports,
      revision: Math.max(current.revision, parsed.revision) + 1,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const acceptRemoteState = useCallback(async () => {
    setSyncStatus("lade");
    try {
      const response = await fetch("/api/state", {
        headers: { accept: "application/json" },
      });
      if (!response.ok || response.status === 204) {
        throw new Error("Der private Serverstand ist nicht verfügbar.");
      }
      const payload: unknown = await response.json();
      if (!isAppState(payload)) {
        throw new Error("Der private Serverstand hat kein unterstütztes Format.");
      }
      const normalized = normalizeState(payload);
      setState(normalized);
      writeLocalState(normalized);
      remoteAvailable.current = true;
      remoteRevision.current = normalized.revision;
      setPersistedRevision(normalized.revision);
      setSyncStatus("synchronisiert");
    } catch (error) {
      setSyncStatus("konflikt");
      throw error;
    }
  }, []);

  return {
    state,
    ready,
    syncStatus,
    persistedRevision,
    updateState,
    replaceState: setState,
    exportBackup,
    importBackup,
    acceptRemoteState,
  };
}
