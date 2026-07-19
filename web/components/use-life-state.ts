"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addCapture,
  analyzeDailyReport,
  applyReportSuggestions,
  completeTask,
  deriveDashboard,
  saveAnalyzedReport,
} from "../lib/domain/engine";
import type { AppState, CaptureDraft, DailyReport } from "../lib/domain/types";
import {
  downloadStateBackup,
  loadStoredState,
  parseStoredState,
  saveStoredState,
} from "../lib/persistence/local-state";

const mutationId = (prefix: string): string =>
  `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

export function useLifeState(initialState: AppState) {
  const [state, setState] = useState(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadStoredState(initialState));
    setHydrated(true);
  }, [initialState]);

  useEffect(() => {
    if (hydrated) saveStoredState(state);
  }, [hydrated, state]);

  const dashboard = useMemo(() => deriveDashboard(state), [state]);

  const actions = useMemo(
    () => ({
      completeTask(taskId: string) {
        setState((current) => completeTask(current, taskId, mutationId("complete-task")));
      },
      addCapture(draft: CaptureDraft) {
        setState((current) => addCapture(current, draft, mutationId("capture")));
      },
      analyzeReport(input: Pick<DailyReport, "text" | "energy" | "focus" | "reportDate">) {
        const report = analyzeDailyReport(state, input);
        setState((current) =>
          saveAnalyzedReport(current, report, mutationId("analyze-report")),
        );
        return report;
      },
      applyReport(reportId: string, suggestionIds: string[]) {
        setState((current) =>
          applyReportSuggestions(
            current,
            reportId,
            suggestionIds,
            mutationId("apply-report"),
          ),
        );
      },
      setPresentationMode(enabled: boolean) {
        setState((current) => ({
          ...current,
          stateVersion: current.stateVersion + 1,
          updatedAt: new Date().toISOString(),
          preferences: { ...current.preferences, presentationMode: enabled },
        }));
      },
      resetDemo() {
        setState(initialState);
      },
      exportBackup() {
        downloadStateBackup(state);
      },
      importBackup(raw: string) {
        const imported = parseStoredState(raw);
        setState(imported);
      },
    }),
    [initialState, state],
  );

  const replaceState = useCallback((nextState: AppState) => setState(nextState), []);

  return { state, dashboard, hydrated, actions, replaceState };
}
