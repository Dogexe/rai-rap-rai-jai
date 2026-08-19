import { L } from "../i18n.js";
import { state } from "../state.js";
import { $, escapeHtml, optionsHtml, monthLabel, refreshIcons } from "../utils.js";
import {
  availableYears, MONTH_NUMS, monthOnlyLabel, yearLabel, computeBudgets,
  computeBreakdown, pieChartSvg, computeTrend
} from "../derived.js";

export function renderInsights() {
  const l = L();
  const years = availableYears();
  // Insights always needs one concrete year (unlike Transactions, it has
  // no "all" option); fall back to the current year if the previously
  // picked one no longer has any data behind it.
  if (!years.includes(state.insightsYear)) state.insightsYear = String(new Date().getFullYear());
  $("screen").innerHTML = `
    <h2 class="screen-title" style="margin-bottom:12px">${escapeHtml(l.financialOverview)}</h2>
    <div class="tabs block" role="radiogroup" style="margin-bottom:14px">
      <label class="tab-opt"><input type="radio" name="insights-tab" value="budgets" ${state.insightsTab === "budgets" ? "checked" : ""}>${escapeHtml(l.budgetsTab)}</label>
      <label class="tab-opt"><input type="radio" name="insights-tab" value="breakdown" ${state.insightsTab === "breakdown" ? "checked" : ""}>${escapeHtml(l.categoryTab)}</label>
      <label class="tab-opt"><input type="radio" name="insights-tab" value="trend" ${state.insightsTab === "trend" ? "checked" : ""}>${escapeHtml(l.trendTab)}</label>
    </div>
    <div class="filter-row" id="insightsMonthRow" style="${state.insightsTab === "trend" ? "display:none" : ""};margin-bottom:18px">
      <select class="input" id="insightsMonthSelect">${optionsHtml(MONTH_NUMS, state.insightsMonthNum, monthOnlyLabel)}</select>
      <select class="input" id="insightsYearSelect">${optionsHtml(years, state.insightsYear, yearLabel)}</select>
    </div>
    <div id="insightsBody"></div>
  `;
  renderInsightsBody();
  document.querySelectorAll('input[name="insights-tab"]').forEach((r) => r.addEventListener("change", (e) => {
    state.insightsTab = e.target.value;
    $("insightsMonthRow").style.display = state.insightsTab === "trend" ? "none" : "";
    renderInsightsBody();
  }));
  $("insightsMonthSelect").addEventListener("change", (e) => { state.insightsMonthNum = e.target.value; renderInsightsBody(); });
  $("insightsYearSelect").addEventListener("change", (e) => { state.insightsYear = e.target.value; renderInsightsBody(); });
}
export function renderInsightsBody() {
  const l = L();
  const body = $("insightsBody");
  const targetMonthKey = state.insightsYear + "-" + state.insightsMonthNum;
  if (state.insightsTab === "budgets") {
    const rows = computeBudgets(targetMonthKey);
    body.innerHTML = `<div class="insight-cards">${rows.map((b) => `
      <div class="insight-card">
        <div class="head"><span class="cat">${escapeHtml(b.category)}</span><span class="badge ${b.badgeClass}">${escapeHtml(b.statusLabel)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${b.pct}%;background:${b.barColor}"></div></div>
        <div class="foot"><span>${b.spentFmt} ${escapeHtml(l.spentSoFar)}</span><span>${escapeHtml(l.budgetOf)} ${b.limitFmt}</span></div>
      </div>`).join("")}</div>`;
  } else if (state.insightsTab === "breakdown") {
    const rows = computeBreakdown(targetMonthKey);
    const monthLbl = monthLabel(targetMonthKey);
    const listHtml = rows.map((d) => `
        <div class="breakdown-row">
          <div class="row1"><span><span class="legend-dot" style="background:${d.color}"></span>${escapeHtml(d.category)}</span><span class="right">${d.totalFmt} · ${Math.round(d.sharePct)}%</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${d.pct}%;background:${d.color}"></div></div>
        </div>`).join("") || `<div class="empty-note">${escapeHtml(l.noExpensesMonth)}</div>`;
    body.innerHTML = `
      <div style="font-size:12px;color:var(--color-muted);margin-bottom:14px">${escapeHtml(l.expenseByCategory)} — ${escapeHtml(monthLbl)}</div>
      ${rows.length ? `
      <div class="breakdown-columns">
        <div style="display:flex;justify-content:center;margin-bottom:16px">${pieChartSvg(rows)}</div>
        <div class="card" style="padding:16px">${listHtml}</div>
      </div>` : listHtml}
    `;
  } else {
    const trend = computeTrend();
    body.innerHTML = trend.length ? `
      <div class="trend-legend">
        <span><span class="swatch" style="background:var(--color-income)"></span>${escapeHtml(l.incomeLabel)}</span>
        <span><span class="swatch" style="background:var(--color-accent)"></span>${escapeHtml(l.expenseLabel)}</span>
      </div>
      <div class="trend-chart-card">
        <div class="trend-chart">
          ${trend.map((m) => `<div class="trend-col"><div class="trend-bars"><div class="bar" style="background:var(--color-income);height:${m.incomeH}px"></div><div class="bar" style="background:var(--color-accent);height:${m.expenseH}px"></div></div></div>`).join("")}
        </div>
        <div class="trend-labels">${trend.map((m) => `<div>${escapeHtml(m.label)}</div>`).join("")}</div>
      </div>
    ` : `<div class="empty-note">${escapeHtml(l.noResults)}</div>`;
  }
  refreshIcons();
}
