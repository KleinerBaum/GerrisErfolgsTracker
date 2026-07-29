"use client";

import {
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

import {
  COST_CADENCE_LABELS,
  type AccountBalances,
  type AppState,
  type Cost,
  type CostCadence,
  type CostStatus,
  type Income,
  type IntegrationConfig,
} from "../lib/types";
import { formatCurrency, formatDate } from "../lib/format";
import { gmailComposeUrl } from "../lib/google-links";

const MONTHLY_FACTORS: Record<CostCadence, number> = {
  once: 0,
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  bimonthly: 1 / 2,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  yearly: 1 / 12,
};

const formatRoundedCurrency = (value: number): string =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));

const isThisMonth = (value: string): boolean => {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
};

const monthlyEquivalent = (cost: Cost): number =>
  cost.amount * MONTHLY_FACTORS[cost.cadence];

type FinanceViewProps = {
  state: AppState;
  integrations: IntegrationConfig;
  onMarkPaid: (costId: string) => void;
  onNewCost: () => void;
  onNewIncome: () => void;
  onPlanCost: (cost: Cost) => Promise<void>;
  onUpdateBalances: (balances: AccountBalances) => void;
};

export function FinanceView({
  state,
  integrations,
  onMarkPaid,
  onNewCost,
  onNewIncome,
  onPlanCost,
  onUpdateBalances,
}: FinanceViewProps) {
  const [filter, setFilter] = useState<CostStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [balancesOpen, setBalancesOpen] = useState(false);
  const [paypalInput, setPaypalInput] = useState("");
  const [revolutInput, setRevolutInput] = useState("");
  const [planningCostId, setPlanningCostId] = useState("");

  const incomes = state.incomes ?? [];
  const balances = state.accountBalances ?? {
    paypal: null,
    revolut: null,
    updatedAt: null,
  };
  const activeCosts = state.costs.filter((cost) => cost.active !== false);
  const runningCosts = activeCosts.filter((cost) => cost.cadence !== "once");
  const otherExpenses = activeCosts
    .filter((cost) => cost.cadence === "once" && isThisMonth(cost.dueAt))
    .sort((left, right) => right.dueAt.localeCompare(left.dueAt));
  const runningTotal = runningCosts.reduce(
    (sum, cost) => sum + monthlyEquivalent(cost),
    0,
  );
  const otherTotal = otherExpenses.reduce(
    (sum, cost) => sum + cost.amount,
    0,
  );
  const monthlyIncome = incomes.reduce((sum, income) => {
    if (income.cadence === "once") {
      return isThisMonth(income.receivedAt) ? sum + income.amount : sum;
    }
    return sum + income.amount * MONTHLY_FACTORS[income.cadence];
  }, 0);
  const monthlyExpenses = runningTotal + otherTotal;
  const monthlyBalance = monthlyIncome - monthlyExpenses;
  const comparisonMax = Math.max(monthlyIncome, monthlyExpenses, 1);

  const categories = (() => {
    const totals = new Map<string, { costs: Cost[]; total: number }>();
    runningCosts.forEach((cost) => {
      const current = totals.get(cost.category) ?? { costs: [], total: 0 };
      current.costs.push(cost);
      current.total += monthlyEquivalent(cost);
      totals.set(cost.category, current);
    });
    return [...totals.entries()]
      .sort((left, right) => right[1].total - left[1].total)
      .map(([name, data]) => ({
        name,
        ...data,
        share: runningTotal > 0 ? (data.total / runningTotal) * 100 : 0,
      }));
  })();

  const visible = state.costs
    .filter((cost) => filter === "all" || cost.status === filter)
    .filter((cost) =>
      `${cost.title} ${cost.category} ${cost.payee} ${cost.subcategory ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((left, right) => right.dueAt.localeCompare(left.dueAt));

  const openBalanceEditor = () => {
    setPaypalInput(
      balances.paypal === null ? "" : String(balances.paypal).replace(".", ","),
    );
    setRevolutInput(
      balances.revolut === null
        ? ""
        : String(balances.revolut).replace(".", ","),
    );
    setBalancesOpen(true);
  };

  const saveBalances = (event: FormEvent) => {
    event.preventDefault();
    const parseBalance = (value: string): number | null => {
      if (!value.trim()) return null;
      const parsed = Number.parseFloat(value.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    };
    onUpdateBalances({
      paypal: parseBalance(paypalInput),
      revolut: parseBalance(revolutInput),
      updatedAt: new Date().toISOString(),
    });
    setBalancesOpen(false);
  };

  const accountUpdatedCopy = balances.updatedAt
    ? `Aktualisiert ${new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "short",
      }).format(new Date(balances.updatedAt))}`
    : "Noch nicht gepflegt";

  return (
    <div className="view-stack finance-view">
      <header className="finance-intro">
        <div>
          <span className="eyebrow">Dein Geld auf einen Blick</span>
          <h1 tabIndex={-1}>Erst verstehen. Dann ins Detail gehen.</h1>
          <p>
            Einnahmen, laufende Kosten und Kontostände bleiben auf der ersten
            Ebene bewusst ruhig. Alle Einzelbeträge findest du erst dort, wo du
            sie wirklich brauchst.
          </p>
        </div>
        <div className="button-group">
          <button
            className="button button-soft"
            onClick={onNewIncome}
            type="button"
          >
            Einnahme hinzufügen
          </button>
          <button
            className="button button-primary"
            onClick={onNewCost}
            type="button"
          >
            Kosten erfassen
          </button>
        </div>
      </header>

      <section className="finance-overview" aria-labelledby="finance-overview-title">
        <div className="money-comparison">
          <div className="finance-section-heading">
            <div>
              <span className="eyebrow">Monatliche Sicht</span>
              <h2 id="finance-overview-title">Einnahmen und Ausgaben</h2>
            </div>
            <strong
              className={monthlyBalance < 0 ? "negative" : ""}
              title={formatCurrency(monthlyBalance)}
            >
              {formatRoundedCurrency(monthlyBalance)}
              <small>Saldo</small>
            </strong>
          </div>

          <div className="money-flow" aria-label="Einnahmen und Ausgaben im Vergleich">
            <article>
              <div>
                <span>Einnahmen</span>
                <strong title={formatCurrency(monthlyIncome)}>
                  {formatRoundedCurrency(monthlyIncome)}
                </strong>
              </div>
              <div className="money-flow-track" aria-hidden="true">
                <i
                  className="income"
                  style={{ width: `${(monthlyIncome / comparisonMax) * 100}%` }}
                />
              </div>
              <small>
                {incomes.length
                  ? `${incomes.length} erfasste ${incomes.length === 1 ? "Einnahme" : "Einnahmen"}`
                  : "Noch keine Einnahme erfasst"}
              </small>
            </article>
            <article>
              <div>
                <span>Ausgaben</span>
                <strong title={formatCurrency(monthlyExpenses)}>
                  {formatRoundedCurrency(monthlyExpenses)}
                </strong>
              </div>
              <div className="money-flow-track" aria-hidden="true">
                <i
                  className="expense"
                  style={{ width: `${(monthlyExpenses / comparisonMax) * 100}%` }}
                />
              </div>
              <small>Laufende Kosten plus weitere Ausgaben im Monat</small>
            </article>
          </div>

          {incomes.length ? (
            <details className="income-details">
              <summary>Einnahmen ansehen</summary>
              <div>
                {incomes.map((income: Income) => (
                  <article key={income.id}>
                    <span>
                      <strong>{income.title}</strong>
                      <small>
                        {income.source || "Ohne Quelle"} ·{" "}
                        {COST_CADENCE_LABELS[income.cadence]}
                      </small>
                    </span>
                    <strong>{formatCurrency(income.amount)}</strong>
                  </article>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <div className="account-overview">
          <div className="finance-section-heading">
            <div>
              <span className="eyebrow">Direkt verfügbar</span>
              <h2>Kontostände</h2>
            </div>
            <button onClick={openBalanceEditor} type="button">
              Aktualisieren
            </button>
          </div>
          <div className="account-cards">
            <article className="account-card paypal">
              <span className="account-mark">P</span>
              <div>
                <span>PayPal</span>
                <strong title={balances.paypal === null ? undefined : formatCurrency(balances.paypal)}>
                  {balances.paypal === null
                    ? "–"
                    : formatRoundedCurrency(balances.paypal)}
                </strong>
                <small>{accountUpdatedCopy}</small>
              </div>
            </article>
            <article className="account-card revolut">
              <span className="account-mark">R</span>
              <div>
                <span>Revolut</span>
                <strong title={balances.revolut === null ? undefined : formatCurrency(balances.revolut)}>
                  {balances.revolut === null
                    ? "–"
                    : formatRoundedCurrency(balances.revolut)}
                </strong>
                <small>{accountUpdatedCopy}</small>
              </div>
            </article>
          </div>

          {balancesOpen ? (
            <form className="balance-form" onSubmit={saveBalances}>
              <label>
                PayPal in Euro
                <input
                  inputMode="decimal"
                  onChange={(event) => setPaypalInput(event.target.value)}
                  placeholder="z. B. 125,50"
                  value={paypalInput}
                />
              </label>
              <label>
                Revolut in Euro
                <input
                  inputMode="decimal"
                  onChange={(event) => setRevolutInput(event.target.value)}
                  placeholder="z. B. 420,00"
                  value={revolutInput}
                />
              </label>
              <div>
                <button
                  className="button button-ghost"
                  onClick={() => setBalancesOpen(false)}
                  type="button"
                >
                  Abbrechen
                </button>
                <button className="button button-primary" type="submit">
                  Speichern
                </button>
              </div>
            </form>
          ) : (
            <p className="account-note">
              Die Kontostände werden manuell und privat in deinem Kompass
              gespeichert.
            </p>
          )}
        </div>
      </section>

      <section className="running-costs-panel" aria-labelledby="running-costs-title">
        <div className="cost-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="running-costs-copy">
          <span className="eyebrow">Monatlicher Durchschnitt</span>
          <h2 id="running-costs-title">Laufende Kosten</h2>
          <strong title={formatCurrency(runningTotal)}>
            {formatRoundedCurrency(runningTotal)}
          </strong>
          <p>
            {runningCosts.length
              ? `${runningCosts.length} aktive ${runningCosts.length === 1 ? "Position" : "Positionen"} · wiederkehrende Beträge auf einen Monat umgerechnet`
              : "Noch keine laufenden Kosten erfasst"}
          </p>
          <button
            aria-expanded={drilldownOpen}
            className="drilldown-button"
            onClick={() => setDrilldownOpen((current) => !current)}
            type="button"
          >
            <span>{drilldownOpen ? "−" : "+"}</span>
            {drilldownOpen ? "Aufschlüsselung schließen" : "Kosten aufschlüsseln"}
          </button>
        </div>

        {drilldownOpen ? (
          <div className="cost-drilldown">
            <div className="drilldown-guide">
              <span>Gesamt</span>
              <i />
              <span>Kategorie</span>
              <i />
              <span>Einzelposten</span>
            </div>
            {categories.length ? (
              <div className="finance-category-list">
                {categories.map((category, index) => (
                  <details
                    className="finance-category-accordion"
                    key={category.name}
                    style={{ "--category-index": index } as CSSProperties}
                  >
                    <summary>
                      <span>
                        <strong>{category.name}</strong>
                        <small>
                          {category.costs.length}{" "}
                          {category.costs.length === 1 ? "Posten" : "Posten"}
                        </small>
                      </span>
                      <div aria-hidden="true">
                        <i style={{ width: `${category.share}%` }} />
                      </div>
                      <strong title={formatCurrency(category.total)}>
                        {formatRoundedCurrency(category.total)}
                      </strong>
                      <span className="accordion-mark">+</span>
                    </summary>
                    <div className="category-cost-list">
                      {category.costs.map((cost) => (
                        <article key={cost.id}>
                          <span>
                            <strong>{cost.title}</strong>
                            <small>
                              {cost.subcategory || COST_CADENCE_LABELS[cost.cadence]}{" "}
                              · {COST_CADENCE_LABELS[cost.cadence]}
                            </small>
                          </span>
                          <span>
                            <strong>{formatCurrency(cost.amount)}</strong>
                            <small>
                              {formatCurrency(monthlyEquivalent(cost))} / Monat
                            </small>
                          </span>
                        </article>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="finance-empty">
                <strong>Noch keine laufenden Kosten</strong>
                <p>
                  Nutze eine der 48 Vorlagen aus deiner Kostentabelle, um mit
                  dem ersten Posten zu beginnen.
                </p>
                <button
                  className="button button-primary"
                  onClick={onNewCost}
                  type="button"
                >
                  Laufende Kosten erfassen
                </button>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="panel other-expenses-panel">
        <div className="finance-section-heading">
          <div>
            <span className="eyebrow">Zusätzlich in diesem Monat</span>
            <h2>Weitere Ausgaben</h2>
          </div>
          <strong title={formatCurrency(otherTotal)}>
            {formatRoundedCurrency(otherTotal)}
          </strong>
        </div>
        {otherExpenses.length ? (
          <div className="other-expense-list">
            {otherExpenses.slice(0, 5).map((cost) => (
              <article key={cost.id}>
                <span>
                  <strong>{cost.title}</strong>
                  <small>
                    {cost.category} · {formatDate(cost.dueAt)}
                  </small>
                </span>
                <strong>{formatRoundedCurrency(cost.amount)}</strong>
              </article>
            ))}
          </div>
        ) : (
          <p className="other-expenses-empty">
            Keine einmaligen Ausgaben für diesen Monat erfasst.
          </p>
        )}
      </section>

      <section className="panel cost-table-panel">
        <div className="table-toolbar">
          <div>
            <span className="eyebrow">Kostenbuch</span>
            <h2>Alle Posten im Detail</h2>
          </div>
          <label className="search-field">
            <span className="visually-hidden">Kosten durchsuchen</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Kosten durchsuchen"
              type="search"
              value={query}
            />
          </label>
        </div>
        <div className="filter-row compact" role="group" aria-label="Kosten filtern">
          {(
            [
              ["all", "Alle"],
              ["paid", "Bezahlt"],
              ["due", "Offen"],
              ["planned", "Geplant"],
            ] as const
          ).map(([key, label]) => (
            <button
              className={filter === key ? "active" : ""}
              key={key}
              onClick={() => setFilter(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="cost-table" role="table" aria-label="Kostenübersicht">
          <div className="cost-head" role="row">
            <span>Posten</span>
            <span>Fälligkeit</span>
            <span>Rhythmus</span>
            <span>Status</span>
            <span>Betrag</span>
            <span>Aktion</span>
          </div>
          {visible.map((cost) => (
            <article className="cost-row" key={cost.id} role="row">
              <div>
                <strong>{cost.title}</strong>
                <small>
                  {cost.category} · {cost.payee || "Kein Empfänger"}
                </small>
              </div>
              <span data-label="Fälligkeit">{formatDate(cost.dueAt)}</span>
              <span data-label="Rhythmus">
                {COST_CADENCE_LABELS[cost.cadence]}
              </span>
              <span data-label="Status">
                <i className={`cost-status status-${cost.status}`}>
                  {cost.status === "paid"
                    ? "Bezahlt"
                    : cost.status === "due"
                      ? "Offen"
                      : "Geplant"}
                </i>
              </span>
              <strong data-label="Betrag">{formatCurrency(cost.amount)}</strong>
              <div className="row-actions">
                {cost.status !== "paid" ? (
                  <button onClick={() => onMarkPaid(cost.id)} type="button">
                    Erledigt
                  </button>
                ) : null}
                {cost.status !== "paid" ? (
                  <button
                    disabled={Boolean(planningCostId)}
                    onClick={async () => {
                      setPlanningCostId(cost.id);
                      await onPlanCost(cost);
                      setPlanningCostId("");
                    }}
                    type="button"
                  >
                    {planningCostId === cost.id ? "Speichert …" : "Kalender"}
                  </button>
                ) : null}
                {cost.contactEmail ? (
                  <a
                    href={gmailComposeUrl(cost, integrations.gmailAccount)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Gmail
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
