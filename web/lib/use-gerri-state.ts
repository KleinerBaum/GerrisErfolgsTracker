"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { COST_CATEGORIES } from "./finance-data";
import { mergeApplicationResearch } from "./application-research";
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
  };
  return {
    ...candidate,
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
    accountBalances: {
      paypal: finiteOrZero(candidate.accountBalances?.paypal),
      revolut: finiteOrZero(candidate.accountBalances?.revolut),
      updatedAt:
        typeof candidate.accountBalances?.updatedAt === "string"
          ? candidate.accountBalances.updatedAt
          : candidate.updatedAt,
    },
    applications: mergeApplicationResearch(candidate.applications),
    masterCvDocumentId:
      typeof candidate.masterCvDocumentId === "string"
        ? candidate.masterCvDocumentId
        : null,
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

function writeLocalState(state: AppState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Der private Server-Speicher bleibt die führende Quelle.
  }
}

export function useGerriState(initialState: AppState) {
  const [state, setState] = useState(initialState);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("lade");
  const [ready, setReady] = useState(false);
  const remoteAvailable = useRef(false);

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
            setSyncStatus("synchronisiert");
          }
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
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(state),
        });
        if (response.ok) {
          remoteAvailable.current = true;
          setSyncStatus("synchronisiert");
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
    setState({
      ...normalizeState(parsed),
      revision: parsed.revision + 1,
      updatedAt: new Date().toISOString(),
    });
  }, []);

  return {
    state,
    syncStatus,
    updateState,
    replaceState: setState,
    exportBackup,
    importBackup,
  };
}
