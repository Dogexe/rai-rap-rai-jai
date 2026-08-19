import { CATEGORIES, guessCategory, iconFor, rowTone, GOAL_ICONS, GOAL_TONES } from "./categories.js";
import { L } from "./i18n.js";
import {
  $, uid, monthKey, fmtMoney, dateLabel, formatDateTyping, parseDateText, monthLabel,
  escapeHtml, icon, iconAvatar, EDIT_ICON, DELETE_ICON, PLUS_ICON, refreshIcons, optionsHtml
} from "./utils.js";
import { state, transactions, budgets, bills, goals, setTransactions, setBudgets, setBills, setGoals } from "./state.js";
import { loadFromStorage, saveToStorage, saveSettings } from "./storage.js";
import { applyTheme } from "./theme.js";
import {
  computeBudgets, checkBudgetAlert, nextBillDueDate, daysUntilBillDue, byRecency, monthKeyOf,
  billDueCycle, dueSoonLabel, upcomingBills, CHART_COLORS, computeBreakdown, pieChartSvg,
  DAY_NUMS, MONTH_NUMS, monthOnlyLabel, yearLabel, availableYears, computeTrend, monthTotal,
  pctDeltaLabel, prevMonthKey, computeSparklinePoints, sparklineSvg
} from "./derived.js";

// ---------- cloud sync (Supabase) ----------
const SUPABASE_URL = "https://kbpnolgucodpiglarsoj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticG5vbGd1Y29kcGlnbGFyc29qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NDkzOTYsImV4cCI6MjEwMjQyNTM5Nn0.mDSJ8msVCVpWRntJTm6hN3etKKm1cq2R3AGhRlX-V0A";
let sb = null;
try {
  if (window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) { sb = null; }

let currentUser = null;
let deferredInstallPrompt = null;
let lastSyncStatus = { text: "", ok: null };

function setSyncStatus(text, ok) {
  lastSyncStatus = { text, ok };
  const el = $("syncStatus");
  if (!el) return;
  el.className = ok === true ? "ok" : (ok === false ? "err" : "");
  el.innerHTML = '<span class="sync-dot"></span><span>' + escapeHtml(text) + "</span>";
}

function rowToTx(r) {
  return { id: r.id, type: r.type, date: r.tx_date, category: r.category, amount: Number(r.amount), note: r.note || "", updatedAt: new Date(r.updated_at).getTime() };
}
function txToRow(t, deleted) {
  return {
    id: t.id, user_id: currentUser ? currentUser.id : null, type: t.type, tx_date: t.date, category: t.category,
    amount: t.amount, note: t.note || "", deleted: !!deleted,
    updated_at: new Date(t.updatedAt || Date.now()).toISOString()
  };
}
function budgetRowToObj(r) { return { id: r.id, category: r.category, limit: Number(r.limit_amount), updatedAt: new Date(r.updated_at).getTime() }; }
function budgetToRow(b, deleted) {
  return {
    id: b.id, user_id: currentUser ? currentUser.id : null, category: b.category, limit_amount: b.limit,
    deleted: !!deleted, updated_at: new Date(b.updatedAt || Date.now()).toISOString()
  };
}
function rowToBill(r) { return { id: r.id, name: r.name, amount: Number(r.amount), day: r.day, category: r.category || CATEGORIES.expense[CATEGORIES.expense.length - 1], lastPaidCycle: r.last_paid_cycle || null, updatedAt: new Date(r.updated_at).getTime() }; }
function billToRow(b, deleted) {
  return {
    id: b.id, user_id: currentUser ? currentUser.id : null, name: b.name, amount: b.amount, day: b.day,
    category: b.category || CATEGORIES.expense[CATEGORIES.expense.length - 1], last_paid_cycle: b.lastPaidCycle || null,
    deleted: !!deleted, updated_at: new Date(b.updatedAt || Date.now()).toISOString()
  };
}
function rowToGoal(r) { return { id: r.id, name: r.name, target: Number(r.target_amount), saved: Number(r.saved_amount), updatedAt: new Date(r.updated_at).getTime() }; }
function goalToRow(g, deleted) {
  return {
    id: g.id, user_id: currentUser ? currentUser.id : null, name: g.name, target_amount: g.target, saved_amount: g.saved,
    deleted: !!deleted, updated_at: new Date(g.updatedAt || Date.now()).toISOString()
  };
}

async function pushRows(table, rows) {
  if (!sb || !currentUser || !rows.length) return true;
  try {
    const { error } = await sb.from(table).upsert(rows);
    if (error) throw error;
    return true;
  } catch (e) { return false; }
}
async function pushTx(t) { return pushRows("transactions", [txToRow(t, false)]); }
async function pushDeleteTx(t) { return pushRows("transactions", [txToRow(t, true)]); }

async function pullTransactions() {
  if (!sb || !currentUser) return false;
  try {
    const { data, error } = await sb.from("transactions").select("*").eq("user_id", currentUser.id);
    if (error) throw error;
    const byId = new Map(transactions.map((t) => [t.id, t]));
    (data || []).forEach((r) => {
      const rTime = new Date(r.updated_at).getTime();
      if (r.deleted) { byId.delete(r.id); return; }
      const local = byId.get(r.id);
      if (!local || (local.updatedAt || 0) < rTime) byId.set(r.id, rowToTx(r));
    });
    setTransactions(Array.from(byId.values()));
    saveToStorage();
    return true;
  } catch (e) { return false; }
}
async function pullBudgets() {
  if (!sb || !currentUser) return false;
  try {
    const { data, error } = await sb.from("budgets").select("*").eq("user_id", currentUser.id);
    if (error) throw error;
    if (!data || !data.length) return true;
    const byCat = new Map(budgets.map((b) => [b.category, b]));
    data.forEach((r) => {
      if (r.deleted) return;
      byCat.set(r.category, budgetRowToObj(r));
    });
    setBudgets(Array.from(byCat.values()));
    saveSettings();
    return true;
  } catch (e) { return false; }
}
async function pullBills() {
  if (!sb || !currentUser) return false;
  try {
    const { data, error } = await sb.from("bills").select("*").eq("user_id", currentUser.id);
    if (error) throw error;
    const byId = new Map(bills.map((b) => [b.id, b]));
    (data || []).forEach((r) => {
      const rTime = new Date(r.updated_at).getTime();
      if (r.deleted) { byId.delete(r.id); return; }
      const local = byId.get(r.id);
      if (!local || (local.updatedAt || 0) < rTime) byId.set(r.id, rowToBill(r));
    });
    setBills(Array.from(byId.values()));
    saveSettings();
    return true;
  } catch (e) { return false; }
}
async function pullGoals() {
  if (!sb || !currentUser) return false;
  try {
    const { data, error } = await sb.from("goals").select("*").eq("user_id", currentUser.id);
    if (error) throw error;
    const byId = new Map(goals.map((g) => [g.id, g]));
    (data || []).forEach((r) => {
      const rTime = new Date(r.updated_at).getTime();
      if (r.deleted) { byId.delete(r.id); return; }
      const local = byId.get(r.id);
      if (!local || (local.updatedAt || 0) < rTime) byId.set(r.id, rowToGoal(r));
    });
    setGoals(Array.from(byId.values()));
    saveSettings();
    return true;
  } catch (e) { return false; }
}

// True while the user has an uncontrolled form open/focused that a full
// screen re-render would silently reset mid-edit (Add screen, budget/bill
// inline forms, or any focused field in the current screen).
function hasLiveInputRisk() {
  if (state.tab === "add") return true;
  if (state.budgetEditId || state.billEditId || state.goalEditId || state.goalContributeId) return true;
  const active = document.activeElement;
  const screenEl = $("screen");
  if (active && screenEl && screenEl.contains(active) && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName)) return true;
  return false;
}

let syncInFlight = false;
async function syncNow() {
  if (!sb) { setSyncStatus("cloud sync unavailable", false); return; }
  if (!currentUser) { setSyncStatus(L().syncSignedOut, null); return; }
  if (syncInFlight) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setSyncStatus(L().syncOffline, false);
    return;
  }
  syncInFlight = true;
  setSyncStatus(L().syncSyncing, null);
  // Pull first: a device/session that hasn't yet learned about a deletion
  // made elsewhere still holds the old (or hardcoded default) row locally.
  // Pushing that stale copy before pulling would re-upload it with a fresh
  // timestamp and silently resurrect it in the cloud (and everywhere else).
  const pullTxOk = await pullTransactions();
  const pullBudgetOk = await pullBudgets();
  const pullBillOk = await pullBills();
  const pullGoalOk = await pullGoals();
  const pushTxOk = await pushRows("transactions", transactions.map((t) => txToRow(t, false)));
  const pushBudgetOk = await pushRows("budgets", budgets.map((b) => budgetToRow(b, false)));
  const pushBillOk = await pushRows("bills", bills.map((b) => billToRow(b, false)));
  const pushGoalOk = await pushRows("goals", goals.map((g) => goalToRow(g, false)));
  if (pushTxOk && pushBudgetOk && pushBillOk && pushGoalOk && pullTxOk && pullBudgetOk && pullBillOk && pullGoalOk) {
    setSyncStatus(L().syncLatest + new Date().toLocaleTimeString(state.lang === "en" ? "en-US" : "th-TH"), true);
    if (!hasLiveInputRisk()) renderScreen();
  } else {
    setSyncStatus(L().syncPartial, false);
  }
  syncInFlight = false;
}

async function signInWithGoogle() {
  if (!sb) return;
  const cleanUrl = window.location.origin + window.location.pathname;
  await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: cleanUrl } });
}
async function signOutUser() {
  if (!sb) return;
  await sb.auth.signOut();
}

// ---------- toast ----------
let toastTimer = null;
function showToast(msg, undoFn) {
  const el = $("toast");
  el.innerHTML = "<span>" + escapeHtml(msg) + "</span>"
    + (undoFn ? '<button type="button" class="toast-undo-btn" id="toastUndoBtn">' + escapeHtml(L().undoBtn) + "</button>" : "");
  el.hidden = false;
  clearTimeout(toastTimer);
  if (undoFn) {
    $("toastUndoBtn").addEventListener("click", () => {
      clearTimeout(toastTimer);
      el.hidden = true;
      undoFn();
    });
  }
  toastTimer = setTimeout(() => { el.hidden = true; }, undoFn ? 4000 : 2200);
}

// Stays here rather than in derived.js: unlike the rest of that section this
// has side effects (mutates state, saves, renders, syncs) instead of being a
// pure computation, and it needs renderScreen()/showToast()/pushTx()/syncNow()
// which don't have a shared home yet (later split stages).
function markBillPaid(id) {
  const bill = bills.find((b) => b.id === id);
  if (!bill) return;
  const savedTx = {
    id: uid(), type: "expense", date: new Date().toISOString().slice(0, 10),
    category: bill.category || CATEGORIES.expense[CATEGORIES.expense.length - 1],
    amount: bill.amount, note: bill.name, updatedAt: Date.now()
  };
  transactions.push(savedTx);
  bill.lastPaidCycle = billDueCycle(bill.day);
  bill.updatedAt = Date.now();
  saveToStorage();
  saveSettings();
  renderScreen();
  showToast(checkBudgetAlert(savedTx) || L().toastAdded);
  Promise.all([pushTx(savedTx), pushRows("bills", [billToRow(bill, false)])]).then(() => syncNow());
}
// ---------- header / tabbar ----------
function renderChrome() {
  document.title = L().appTitle;
  document.documentElement.lang = state.lang;
  document.querySelectorAll("#tabbar span[data-l]").forEach((el) => { el.textContent = L()[el.getAttribute("data-l")]; });
  document.querySelectorAll("#tabbar button").forEach((btn) => btn.classList.toggle("active", btn.getAttribute("data-tab") === state.tab));
}

// ---------- Home ----------
function renderHome() {
  const l = L();
  const income = transactions.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);
  const expense = transactions.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);
  const recent = transactions.slice().sort(byRecency).slice(0, 5);
  const budgetsPreview = computeBudgets().slice(0, 2);
  const dueSoon = upcomingBills();
  const today = new Date().toLocaleDateString(state.lang === "en" ? "en-US" : "th-TH", { month: "long", year: "numeric" });

  const curM = new Date().toISOString().slice(0, 7);
  const prevM = prevMonthKey();
  const curIncome = monthTotal(curM, "income"), prevIncome = monthTotal(prevM, "income");
  const curExpense = monthTotal(curM, "expense"), prevExpense = monthTotal(prevM, "expense");
  const balanceDelta = pctDeltaLabel(curIncome - curExpense, prevIncome - prevExpense);
  const incomeDelta = pctDeltaLabel(curIncome, prevIncome);
  const expenseDelta = pctDeltaLabel(curExpense, prevExpense);
  const sparkline = sparklineSvg(computeSparklinePoints(), "#ffffff", 150, 34, 2.5);
  const todayIso = new Date().toISOString().slice(0, 10);
  const spentToday = transactions.filter((t) => t.type === "expense" && t.date === todayIso).reduce((a, t) => a + t.amount, 0);

  $("screen").innerHTML = `
    <div class="today-label">${escapeHtml(today)}</div>
    <h2 class="screen-title" style="margin:2px 0 0">${escapeHtml(l.overview)}</h2>
    <div class="home-columns">
      <div class="home-col-main">
        <div class="hero-card">
          <div class="kicker">${escapeHtml(l.balanceLabel)}</div>
          <div class="amount">${fmtMoney(income - expense)}</div>
          <div class="foot-row">
            ${sparkline}
            <div class="delta-pill">${escapeHtml(balanceDelta)}</div>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat-card">
            <div class="head">${icon("arrow-down-left")}<span>${escapeHtml(l.incomeLabel)}</span></div>
            <div class="value">${fmtMoney(income)}</div>
            <div class="delta" style="color:var(--color-income)">${escapeHtml(incomeDelta)} ${escapeHtml(l.vsLastMonth)}</div>
          </div>
          <div class="stat-card">
            <div class="head">${icon("arrow-up-right")}<span>${escapeHtml(l.expenseLabel)}</span></div>
            <div class="value">${fmtMoney(expense)}</div>
            <div class="delta" style="color:var(--color-expense)">${escapeHtml(expenseDelta)} ${escapeHtml(l.vsLastMonth)}</div>
          </div>
        </div>

        <div class="today-spend-card">
          ${iconAvatar("wallet", "var(--color-expense-tint)", "var(--color-expense-700)", "sm")}
          <span class="label">${escapeHtml(l.spentToday)}</span>
          <span class="value">${fmtMoney(spentToday)}</span>
        </div>

        <div class="section-head">
          <h3>${escapeHtml(l.recentTx)}</h3>
          <button type="button" class="btn btn-ghost" id="goAddBtn">${escapeHtml(l.addShort)}</button>
        </div>
        <div class="list-card">
          ${recent.map((t) => txRowHtml(t)).join("") || `<div class="empty-note">${escapeHtml(l.noResults)}</div>`}
        </div>
      </div>
      <div class="home-col-side">
        ${dueSoon.length ? `
        <div class="section-head" style="margin-top:0">
          <h3>${escapeHtml(l.upcomingBillsSection)}</h3>
        </div>
        <div class="list-card">
          ${dueSoon.map((b) => `
            <div class="manage-row">
              ${iconAvatar("calendar-clock", "var(--color-warning-tint)", "var(--color-warning-text)")}
              <div class="info">
                <div class="name">${escapeHtml(b.name)}</div>
                <div class="sub">${escapeHtml(dueSoonLabel(b.daysUntil))}</div>
              </div>
              <div class="amt">${fmtMoney(b.amount)}</div>
              <button type="button" class="btn btn-secondary btn-sm" data-mark-paid="${b.id}">${escapeHtml(l.markPaidBtn)}</button>
            </div>`).join("")}
        </div>` : ""}
        <div class="section-head" style="${dueSoon.length ? "" : "margin-top:0"}">
          <h3>${escapeHtml(l.budgetsThisMonth)}</h3>
          <button type="button" class="btn btn-ghost" id="goBudgetsBtn">${escapeHtml(l.seeAll)}</button>
        </div>
        <div class="card budgets-list">
          ${budgetsPreview.map((b) => `
            <div class="budget-item">
              <div class="row1"><span>${escapeHtml(b.category)}</span><span class="right">${b.spentFmt} / ${b.limitFmt}</span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${b.pct}%;background:${b.barColor}"></div></div>
            </div>`).join("")}
        </div>
      </div>
    </div>
  `;
  $("goAddBtn").addEventListener("click", () => { resetForm(); setTab("add"); });
  $("goBudgetsBtn").addEventListener("click", () => { state.insightsTab = "budgets"; setTab("insights"); });
  document.querySelectorAll("[data-mark-paid]").forEach((btn) => btn.addEventListener("click", () => markBillPaid(btn.getAttribute("data-mark-paid"))));
  wireTxRowActions();
  refreshIcons();
}

function txRowHtml(t) {
  const tone = rowTone(t.type);
  const amountColor = t.type === "income" ? "var(--color-income)" : "var(--color-text)";
  const sign = t.type === "income" ? "+" : "−";
  return `
    <div class="tx-row" data-tx-actions data-id="${t.id}">
      ${iconAvatar(iconFor(t.category), tone.bg, tone.color)}
      <div class="info">
        <div class="cat">${escapeHtml(t.category)}</div>
        <div class="meta">${dateLabel(t.date)}${t.note ? " · " + escapeHtml(t.note) : ""}</div>
      </div>
      <div class="amt" style="color:${amountColor}">${sign}${fmtMoney(t.amount)}</div>
      ${t.__actions ? `
      <div class="actions">
        <button type="button" class="btn btn-icon" data-edit="${t.id}" aria-label="${escapeHtml(L().editAria)}">${EDIT_ICON}</button>
        <button type="button" class="btn btn-icon" style="color:var(--color-expense-700)" data-delete="${t.id}" aria-label="${escapeHtml(L().deleteAria)}">${DELETE_ICON}</button>
      </div>` : ""}
    </div>`;
}
function wireTxRowActions() {
  document.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => editTx(btn.getAttribute("data-edit"))));
  document.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => deleteTx(btn.getAttribute("data-delete"))));
}

// ---------- Transactions ----------
function filteredTxList() {
  let rows = transactions.slice();
  if (state.txFilterType !== "all") rows = rows.filter((t) => t.type === state.txFilterType);
  if (state.txFilterDay !== "all") rows = rows.filter((t) => t.date.slice(8, 10) === state.txFilterDay);
  if (state.txFilterMonthNum !== "all") rows = rows.filter((t) => t.date.slice(5, 7) === state.txFilterMonthNum);
  if (state.txFilterYear !== "all") rows = rows.filter((t) => t.date.slice(0, 4) === state.txFilterYear);
  if (state.txFilterCategory !== "all") rows = rows.filter((t) => t.category === state.txFilterCategory);
  const q = state.txSearch.trim().toLowerCase();
  if (q) rows = rows.filter((t) => (t.note || "").toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  return rows.sort(byRecency);
}
function renderTxListOnly() {
  const l = L();
  const rows = filteredTxList();
  const html = rows.map((t) => txRowHtml(Object.assign({}, t, { __actions: true }))).join("")
    || `<div class="empty-note">${escapeHtml(l.noResults)}</div>`;
  $("txListContainer").innerHTML = html;
  wireTxRowActions();
  refreshIcons();
}
function renderTransactions() {
  const l = L();
  const years = availableYears();
  // If the previously-picked year no longer has any data behind it (e.g.
  // its only transactions were deleted), fall back to "all" rather than
  // leaving the select pointing at an option that no longer exists.
  if (state.txFilterYear !== "all" && !years.includes(state.txFilterYear)) state.txFilterYear = "all";
  const allCats = CATEGORIES.income.concat(CATEGORIES.expense);
  $("screen").innerHTML = `
    <h2 class="screen-title">${escapeHtml(l.allTransactions)}</h2>
    <div class="tabs block" role="radiogroup" style="margin-bottom:12px">
      <label class="tab-opt"><input type="radio" name="tx-type-filter" value="all" ${state.txFilterType === "all" ? "checked" : ""}>${escapeHtml(l.filterAll)}</label>
      <label class="tab-opt"><input type="radio" name="tx-type-filter" value="income" ${state.txFilterType === "income" ? "checked" : ""}>${escapeHtml(l.incomeLabel)}</label>
      <label class="tab-opt"><input type="radio" name="tx-type-filter" value="expense" ${state.txFilterType === "expense" ? "checked" : ""}>${escapeHtml(l.expenseLabel)}</label>
    </div>
    <div class="filter-row">
      <select class="input" id="txFilterDay">
        <option value="all">${escapeHtml(l.allDays)}</option>
        ${optionsHtml(DAY_NUMS, state.txFilterDay)}
      </select>
      <select class="input" id="txFilterMonth">
        <option value="all">${escapeHtml(l.allMonths)}</option>
        ${optionsHtml(MONTH_NUMS, state.txFilterMonthNum, monthOnlyLabel)}
      </select>
      <select class="input" id="txFilterYear">
        <option value="all">${escapeHtml(l.allYears)}</option>
        ${optionsHtml(years, state.txFilterYear, yearLabel)}
      </select>
    </div>
    <div class="filter-row">
      <select class="input" id="txFilterCategory">
        <option value="all">${escapeHtml(l.allCategories)}</option>
        ${optionsHtml(allCats, state.txFilterCategory)}
      </select>
    </div>
    <input class="input" style="margin-bottom:12px" id="txSearchInput" placeholder="${escapeHtml(l.searchPlaceholder)}" value="${escapeHtml(state.txSearch)}">
    <div class="list-card" id="txListContainer"></div>
  `;
  renderTxListOnly();
  document.querySelectorAll('input[name="tx-type-filter"]').forEach((r) => r.addEventListener("change", (e) => { state.txFilterType = e.target.value; renderTxListOnly(); }));
  $("txFilterDay").addEventListener("change", (e) => { state.txFilterDay = e.target.value; renderTxListOnly(); });
  $("txFilterMonth").addEventListener("change", (e) => { state.txFilterMonthNum = e.target.value; renderTxListOnly(); });
  $("txFilterYear").addEventListener("change", (e) => { state.txFilterYear = e.target.value; renderTxListOnly(); });
  $("txFilterCategory").addEventListener("change", (e) => { state.txFilterCategory = e.target.value; renderTxListOnly(); });
  $("txSearchInput").addEventListener("input", (e) => { state.txSearch = e.target.value; renderTxListOnly(); });
  refreshIcons();
}

// ---------- Add / Edit ----------
function resetForm() {
  state.formType = "expense";
  state.formDate = new Date().toISOString().slice(0, 10);
  state.formCategory = CATEGORIES.expense[0];
  state.editingId = null;
  state.categoryManual = false;
}
function editTx(id) {
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return;
  state.editingId = id;
  state.formType = tx.type;
  state.formDate = tx.date;
  state.formCategory = tx.category;
  state.categoryManual = true;
  setTab("add");
}
function deleteTx(id) {
  if (state.editingId === id) resetForm();
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return;
  setTransactions(transactions.filter((t) => t.id !== id));
  saveToStorage();
  renderScreen();
  tx.updatedAt = Date.now();
  pushDeleteTx(tx).then(() => syncNow());
  showToast(L().toastDeleted, () => {
    const restored = Object.assign({}, tx, { updatedAt: Date.now() });
    transactions.push(restored);
    saveToStorage();
    renderScreen();
    pushTx(restored).then(() => syncNow());
  });
}
function renderFormCategoryOptions(select) {
  const opts = state.formType === "income" ? CATEGORIES.income : CATEGORIES.expense;
  select.innerHTML = optionsHtml(opts, state.formCategory);
}
function renderAdd() {
  const l = L();
  const isEditing = !!state.editingId;
  $("screen").innerHTML = `
    <h2 class="screen-title">${escapeHtml(isEditing ? l.editTitle : l.addTitle)}</h2>
    <form class="add-form" id="addForm">
      <div class="field">
        <label>${escapeHtml(l.typeLabel)}</label>
        <div class="tabs block" role="radiogroup">
          <label class="tab-opt"><input type="radio" name="form-type" value="expense" ${state.formType === "expense" ? "checked" : ""}>${escapeHtml(l.expenseLabel)}</label>
          <label class="tab-opt"><input type="radio" name="form-type" value="income" ${state.formType === "income" ? "checked" : ""}>${escapeHtml(l.incomeLabel)}</label>
        </div>
      </div>
      <div class="field">
        <label for="txDateText">${escapeHtml(l.dateLabel)}</label>
        <div class="date-input-wrap">
          <div class="input-wrap">
            <input type="text" id="txDateText" inputmode="numeric" placeholder="dd/mm/yyyy" maxlength="10" value="${dateLabel(state.formDate)}" required>
          </div>
          <svg class="date-icon icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <input class="date-native-overlay" type="date" id="txDateNative" value="${state.formDate}" tabindex="-1" aria-hidden="true">
        </div>
      </div>
      <div class="field">
        <label for="txCategory">${escapeHtml(l.categoryLabel)}</label>
        <select class="input" id="txCategory" required></select>
      </div>
      <div class="field">
        <label for="txAmount">${escapeHtml(l.amountLabel)}</label>
        <div class="input-wrap"><span class="prefix">฿</span><input type="number" id="txAmount" min="0" step="0.01" placeholder="0.00" required></div>
      </div>
      <div class="field">
        <label for="txNote">${escapeHtml(l.noteLabel)}</label>
        <div class="input-wrap"><input type="text" id="txNote" placeholder="${escapeHtml(l.notePlaceholder)}"></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${escapeHtml(isEditing ? l.saveEditBtn : l.saveBtn)}</button>
      ${isEditing ? `<button type="button" class="btn btn-secondary btn-block" id="cancelEditBtn">${escapeHtml(l.cancelEditBtn)}</button>` : ""}
    </form>
  `;
  renderFormCategoryOptions($("txCategory"));
  if (isEditing) {
    const tx = transactions.find((t) => t.id === state.editingId);
    if (tx) { $("txAmount").value = tx.amount; $("txNote").value = tx.note || ""; }
  }
  document.querySelectorAll('input[name="form-type"]').forEach((r) => r.addEventListener("change", (e) => {
    state.formType = e.target.value;
    const guess = state.categoryManual ? state.formCategory : guessCategory($("txNote").value, state.formType);
    const opts = state.formType === "income" ? CATEGORIES.income : CATEGORIES.expense;
    state.formCategory = (guess && opts.includes(guess)) ? guess : opts[0];
    renderFormCategoryOptions($("txCategory"));
  }));
  $("txCategory").addEventListener("change", (e) => { state.formCategory = e.target.value; state.categoryManual = true; });
  $("txDateText").addEventListener("input", function () { this.value = formatDateTyping(this.value); });
  $("txDateText").addEventListener("change", function () {
    const iso = parseDateText(this.value);
    if (iso) { state.formDate = iso; $("txDateNative").value = iso; }
    else { this.value = dateLabel(state.formDate); }
  });
  $("txDateNative").addEventListener("change", function () {
    if (this.value) { state.formDate = this.value; $("txDateText").value = dateLabel(this.value); }
  });
  $("txNote").addEventListener("input", function () {
    if (state.categoryManual) return;
    const guess = guessCategory(this.value, state.formType);
    if (guess) { state.formCategory = guess; $("txCategory").value = guess; }
  });
  if (isEditing) $("cancelEditBtn").addEventListener("click", () => { resetForm(); setTab("transactions"); });
  $("addForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const date = state.formDate;
    const amount = parseFloat($("txAmount").value);
    if (!date || !amount || amount <= 0) { showToast(L().toastInvalidAmount); return; }
    const note = $("txNote").value.trim();
    const category = $("txCategory").value;
    let savedTx = null;
    if (state.editingId) {
      const idx = transactions.findIndex((t) => t.id === state.editingId);
      if (idx >= 0) {
        transactions[idx] = Object.assign({}, transactions[idx], { type: state.formType, date, category, amount, note, updatedAt: Date.now() });
        savedTx = transactions[idx];
      }
      showToast(L().toastEdited);
    } else {
      savedTx = { id: uid(), type: state.formType, date, category, amount, note, updatedAt: Date.now() };
      transactions.push(savedTx);
      showToast(checkBudgetAlert(savedTx) || L().toastAdded);
    }
    saveToStorage();
    resetForm();
    setTab("transactions");
    if (savedTx) pushTx(savedTx).then(() => syncNow());
  });
  refreshIcons();
}

// ---------- Insights ----------
function renderInsights() {
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
function renderInsightsBody() {
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

// ---------- Budgets / Bills management ----------
// Both are simple named lists edited inline in Settings; share one row/CRUD shape.
function manageRowHtml(name, sub, amt, editAttr, deleteAttr) {
  return `
    <div class="manage-row">
      <div class="info"><div class="name">${escapeHtml(name)}</div><div class="sub">${escapeHtml(sub)}</div></div>
      ${amt ? `<div class="amt">${amt}</div>` : ""}
      <div class="row-actions">
        <button type="button" class="btn btn-icon" ${editAttr} aria-label="${escapeHtml(L().editAria)}">${EDIT_ICON}</button>
        <button type="button" class="btn btn-icon" style="color:var(--color-expense-700)" ${deleteAttr} aria-label="${escapeHtml(L().deleteAria)}">${DELETE_ICON}</button>
      </div>
    </div>`;
}
// Wraps a set of field inputs with the standard Save/Cancel action row used
// by every inline add/edit form (budgets, bills, goals, goal contributions).
function inlineForm(fieldsHtml, saveId, saveLabel, cancelId, extraStyle) {
  return `<div class="inline-form"${extraStyle ? ` style="${extraStyle}"` : ""}>${fieldsHtml}<div class="actions-row"><button type="button" class="btn btn-primary" id="${saveId}">${escapeHtml(saveLabel)}</button><button type="button" class="btn btn-secondary" id="${cancelId}">${escapeHtml(L().cancelBtn)}</button></div></div>`;
}
// Wires the add/edit/delete/save/cancel buttons shared by the Budgets,
// Bills, and Goals sections in Settings. `prefix` (capitalized) matches the
// element ids (e.g. "Budget" -> addBudgetBtn/saveBudgetFormBtn/data-edit-budget).
function wireInlineCrud(prefix, stateKey, deleteFn, saveFn, onOpen) {
  const tag = prefix.toLowerCase();
  const addBtn = $("add" + prefix + "Btn");
  if (addBtn) addBtn.addEventListener("click", () => { state[stateKey] = "new"; if (onOpen) onOpen(); renderSettings(); });
  document.querySelectorAll(`[data-edit-${tag}]`).forEach((btn) => btn.addEventListener("click", () => {
    state[stateKey] = btn.getAttribute(`data-edit-${tag}`); if (onOpen) onOpen(); renderSettings();
  }));
  document.querySelectorAll(`[data-delete-${tag}]`).forEach((btn) => btn.addEventListener("click", () => deleteFn(btn.getAttribute(`data-delete-${tag}`))));
  const saveBtn = $("save" + prefix + "FormBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveFn);
  const cancelBtn = $("cancel" + prefix + "FormBtn");
  if (cancelBtn) cancelBtn.addEventListener("click", () => { state[stateKey] = null; renderSettings(); });
}

function budgetRowHtml(b) {
  return manageRowHtml(b.category, L().budgetOf + " " + fmtMoney(b.limit), null, `data-edit-budget="${b.id}"`, `data-delete-budget="${b.id}"`);
}
function budgetFormHtml() {
  const l = L();
  if (!state.budgetEditId) return "";
  const isNew = state.budgetEditId === "new";
  const editing = !isNew ? budgets.find((b) => b.id === state.budgetEditId) : null;
  if (!isNew && !editing) return "";
  const usedCats = new Set(budgets.filter((b) => b.id !== state.budgetEditId).map((b) => b.category));
  const availableCats = CATEGORIES.expense.filter((c) => !usedCats.has(c));
  if (isNew && !availableCats.length) {
    return `<div class="inline-form"><div class="empty-note" style="padding:8px 0">${escapeHtml(l.allBudgeted)}</div><button type="button" class="btn btn-secondary" id="cancelBudgetFormBtn">${escapeHtml(l.cancelBtn)}</button></div>`;
  }
  const fields = (isNew
    ? `<div class="field"><label>${escapeHtml(l.categoryLabel)}</label><select class="input" id="budgetCategorySelect">${optionsHtml(availableCats, null)}</select></div>`
    : `<div style="font-size:14px;font-weight:600">${escapeHtml(editing.category)}</div>`)
    + `<div class="field"><label>${escapeHtml(l.limitLabel)}</label><input class="input" type="number" id="budgetLimitInput" min="0" step="1" value="${isNew ? "" : editing.limit}"></div>`;
  return inlineForm(fields, "saveBudgetFormBtn", l.saveBudgetBtn, "cancelBudgetFormBtn");
}
function saveBudgetForm() {
  const isNew = state.budgetEditId === "new";
  const limitInput = $("budgetLimitInput");
  const limit = limitInput ? parseFloat(limitInput.value) : NaN;
  if (!limit || limit <= 0) { showToast(L().toastInvalidAmount); return; }
  let saved;
  if (isNew) {
    const sel = $("budgetCategorySelect");
    const category = sel ? sel.value : "";
    if (!category) return;
    saved = { id: uid(), category, limit, updatedAt: Date.now() };
    budgets.push(saved);
  } else {
    const b = budgets.find((x) => x.id === state.budgetEditId);
    if (!b) return;
    b.limit = limit; b.updatedAt = Date.now();
    saved = b;
  }
  saveSettings();
  state.budgetEditId = null;
  showToast(L().toastBudgetSaved);
  renderSettings();
  pushRows("budgets", [budgetToRow(saved, false)]).then(() => syncNow());
}
function deleteBudget(id) {
  const b = budgets.find((x) => x.id === id);
  if (!b) return;
  setBudgets(budgets.filter((x) => x.id !== id));
  saveSettings();
  if (state.budgetEditId === id) state.budgetEditId = null;
  renderSettings();
  b.updatedAt = Date.now();
  pushRows("budgets", [budgetToRow(b, true)]).then(() => syncNow());
  showToast(L().toastBudgetDeleted, () => {
    const restored = Object.assign({}, b, { updatedAt: Date.now() });
    budgets.push(restored);
    saveSettings();
    renderSettings();
    pushRows("budgets", [budgetToRow(restored, false)]).then(() => syncNow());
  });
}

function billRowHtml(b) {
  return manageRowHtml(b.name, L().dueOn + b.day, fmtMoney(b.amount), `data-edit-bill="${b.id}"`, `data-delete-bill="${b.id}"`);
}
function billFormHtml() {
  const l = L();
  if (!state.billEditId) return "";
  const isNew = state.billEditId === "new";
  const editing = !isNew ? bills.find((b) => b.id === state.billEditId) : null;
  if (!isNew && !editing) return "";
  const curCategory = isNew ? CATEGORIES.expense[0] : editing.category;
  const fields = `
    <div class="field"><label>${escapeHtml(l.billNameLabel)}</label><input class="input" type="text" id="billNameInput" value="${isNew ? "" : escapeHtml(editing.name)}"></div>
    <div class="field"><label>${escapeHtml(l.categoryLabel)}</label><select class="input" id="billCategorySelect">${optionsHtml(CATEGORIES.expense, curCategory)}</select></div>
    <div class="field"><label>${escapeHtml(l.amountLabel)}</label><input class="input" type="number" id="billAmountInput" min="0" step="0.01" value="${isNew ? "" : editing.amount}"></div>
    <div class="field"><label>${escapeHtml(l.billDayLabel)}</label><input class="input" type="number" id="billDayInput" min="1" max="31" step="1" value="${isNew ? "" : editing.day}"></div>
  `;
  return inlineForm(fields, "saveBillFormBtn", l.saveBillBtn, "cancelBillFormBtn");
}
function saveBillForm() {
  const isNew = state.billEditId === "new";
  const name = ($("billNameInput") || {}).value ? $("billNameInput").value.trim() : "";
  const category = ($("billCategorySelect") || {}).value || CATEGORIES.expense[0];
  const amount = parseFloat(($("billAmountInput") || {}).value);
  const day = parseInt(($("billDayInput") || {}).value, 10);
  if (!name || !amount || amount <= 0 || !day || day < 1 || day > 31) { showToast(L().toastInvalidAmount); return; }
  let saved;
  if (isNew) {
    saved = { id: uid(), name, category, amount, day, updatedAt: Date.now() };
    bills.push(saved);
  } else {
    const b = bills.find((x) => x.id === state.billEditId);
    if (!b) return;
    b.name = name; b.category = category; b.amount = amount; b.day = day; b.updatedAt = Date.now();
    saved = b;
  }
  saveSettings();
  state.billEditId = null;
  showToast(L().toastBillSaved);
  renderSettings();
  pushRows("bills", [billToRow(saved, false)]).then(() => syncNow());
}
function deleteBill(id) {
  const b = bills.find((x) => x.id === id);
  if (!b) return;
  setBills(bills.filter((x) => x.id !== id));
  saveSettings();
  if (state.billEditId === id) state.billEditId = null;
  renderSettings();
  b.updatedAt = Date.now();
  pushRows("bills", [billToRow(b, true)]).then(() => syncNow());
  showToast(L().toastBillDeleted, () => {
    const restored = Object.assign({}, b, { updatedAt: Date.now() });
    bills.push(restored);
    saveSettings();
    renderSettings();
    pushRows("bills", [billToRow(restored, false)]).then(() => syncNow());
  });
}

// ---------- Savings goals management ----------
function goalCardHtml(g, idx) {
  const l = L();
  const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
  const complete = g.saved >= g.target;
  const tone = GOAL_TONES[idx % GOAL_TONES.length];
  const gIcon = GOAL_ICONS[idx % GOAL_ICONS.length];
  return `
    <div class="goal-card">
      <div class="top">
        ${iconAvatar(gIcon, tone.bg, tone.color)}
        <div style="flex:1;min-width:0">
          <div class="name">${escapeHtml(g.name)}</div>
          <div class="progress-label">${fmtMoney(g.saved)} ${escapeHtml(l.ofLabel || "/")} ${fmtMoney(g.target)}</div>
        </div>
        <span class="badge ${complete ? "badge-income" : "badge-brand"}">${complete ? escapeHtml(l.goalComplete) : pct + "%"}</span>
        <div class="goal-card-actions">
          <button type="button" class="btn btn-icon" data-contribute-goal="${g.id}" aria-label="${escapeHtml(l.contributeAria)}">${PLUS_ICON}</button>
          <button type="button" class="btn btn-icon" data-edit-goal="${g.id}" aria-label="${escapeHtml(l.editAria)}">${EDIT_ICON}</button>
          <button type="button" class="btn btn-icon" style="color:var(--color-expense-700)" data-delete-goal="${g.id}" aria-label="${escapeHtml(l.deleteAria)}">${DELETE_ICON}</button>
        </div>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${complete ? "var(--color-income)" : tone.color}"></div></div>
      ${state.goalContributeId === g.id ? goalContributeFormHtml() : ""}
    </div>`;
}
function goalContributeFormHtml() {
  const l = L();
  const fields = `<div class="field"><label>${escapeHtml(l.contributeAmountLabel)}</label><input class="input" type="number" id="goalContributeInput" min="0" step="0.01"></div>`;
  return inlineForm(fields, "saveContributeBtn", l.addFundsBtn, "cancelContributeBtn", "margin:14px 0 0");
}
function goalFormHtml() {
  const l = L();
  if (!state.goalEditId) return "";
  const isNew = state.goalEditId === "new";
  const editing = !isNew ? goals.find((g) => g.id === state.goalEditId) : null;
  if (!isNew && !editing) return "";
  const fields = `
    <div class="field"><label>${escapeHtml(l.goalNameLabel)}</label><input class="input" type="text" id="goalNameInput" value="${isNew ? "" : escapeHtml(editing.name)}"></div>
    <div class="field"><label>${escapeHtml(l.targetLabel)}</label><input class="input" type="number" id="goalTargetInput" min="0" step="0.01" value="${isNew ? "" : editing.target}"></div>
    <div class="field"><label>${escapeHtml(l.savedLabel)}</label><input class="input" type="number" id="goalSavedInput" min="0" step="0.01" value="${isNew ? "0" : editing.saved}"></div>
  `;
  return inlineForm(fields, "saveGoalFormBtn", l.saveGoalBtn, "cancelGoalFormBtn");
}
function saveGoalForm() {
  const isNew = state.goalEditId === "new";
  const name = ($("goalNameInput") || {}).value ? $("goalNameInput").value.trim() : "";
  const target = parseFloat(($("goalTargetInput") || {}).value);
  const saved = parseFloat(($("goalSavedInput") || {}).value) || 0;
  if (!name || !target || target <= 0 || saved < 0) { showToast(L().toastInvalidAmount); return; }
  let savedGoal;
  if (isNew) {
    savedGoal = { id: uid(), name, target, saved, updatedAt: Date.now() };
    goals.push(savedGoal);
  } else {
    const g = goals.find((x) => x.id === state.goalEditId);
    if (!g) return;
    g.name = name; g.target = target; g.saved = saved; g.updatedAt = Date.now();
    savedGoal = g;
  }
  saveSettings();
  state.goalEditId = null;
  showToast(L().toastGoalSaved);
  renderSettings();
  pushRows("goals", [goalToRow(savedGoal, false)]).then(() => syncNow());
}
function deleteGoal(id) {
  const g = goals.find((x) => x.id === id);
  if (!g) return;
  setGoals(goals.filter((x) => x.id !== id));
  saveSettings();
  if (state.goalEditId === id) state.goalEditId = null;
  renderSettings();
  g.updatedAt = Date.now();
  pushRows("goals", [goalToRow(g, true)]).then(() => syncNow());
  showToast(L().toastGoalDeleted, () => {
    const restored = Object.assign({}, g, { updatedAt: Date.now() });
    goals.push(restored);
    saveSettings();
    renderSettings();
    pushRows("goals", [goalToRow(restored, false)]).then(() => syncNow());
  });
}
function saveContribution() {
  const g = goals.find((x) => x.id === state.goalContributeId);
  const amount = parseFloat(($("goalContributeInput") || {}).value);
  if (!g || !amount || amount <= 0) { showToast(L().toastInvalidAmount); return; }
  g.saved += amount;
  g.updatedAt = Date.now();
  saveSettings();
  state.goalContributeId = null;
  showToast(L().toastFundsAdded);
  renderSettings();
  pushRows("goals", [goalToRow(g, false)]).then(() => syncNow());
}

// ---------- Settings ----------
function renderSettings() {
  const l = L();
  const meta = currentUser ? (currentUser.user_metadata || {}) : {};
  const avatarUrl = meta.avatar_url || meta.picture || "";
  const name = currentUser ? (meta.full_name || meta.name || currentUser.email || "") : l.notSignedIn;

  $("screen").innerHTML = `
    <h2 class="screen-title" style="margin-bottom:22px">${escapeHtml(l.settingsTitle)}</h2>
    <div class="settings-block">

      <div class="settings-columns">
        <div class="settings-col">
          <div class="profile-row">
            ${avatarUrl ? `<img class="avatar" src="${escapeHtml(avatarUrl)}" alt="">` : `<div class="avatar">${currentUser ? escapeHtml((name || "?").slice(0, 1).toUpperCase()) : icon("user")}</div>`}
            <div>
              <div class="profile-name">${escapeHtml(name)}</div>
              <div class="profile-sub">${escapeHtml(currentUser ? l.personalAccount : "")}</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="authBtn">${escapeHtml(currentUser ? l.signOutBtn : l.signInGoogle)}</button>
          </div>

          <div>
            <div class="settings-section-label">${escapeHtml(l.languageSection)}</div>
            <div class="tabs block" role="radiogroup">
              <label class="tab-opt"><input type="radio" name="lang-switch" value="th" ${state.lang === "th" ? "checked" : ""}>ไทย</label>
              <label class="tab-opt"><input type="radio" name="lang-switch" value="en" ${state.lang === "en" ? "checked" : ""}>English</label>
            </div>
          </div>

          <div>
            <div class="settings-section-label">${escapeHtml(l.displaySection)}</div>
            <div class="list-card">
              <div class="toggle-row">
                ${iconAvatar("moon", "var(--color-accent-tint)", "var(--color-accent)", "sm", 'width="15" height="15"')}
                <span class="label">${escapeHtml(l.darkModeBtn)}</span>
                <button type="button" class="switch ${state.dark ? "on" : ""}" id="darkSwitch"><span class="thumb"></span></button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-col">
          <div>
            <div class="settings-section-label">${escapeHtml(l.syncSection)}</div>
            <div class="sync-box">
              <span id="syncStatus" class="${lastSyncStatus.ok === true ? "ok" : (lastSyncStatus.ok === false ? "err" : "")}"><span class="sync-dot"></span><span>${escapeHtml(currentUser ? lastSyncStatus.text : l.syncSignedOut)}</span></span>
              <div style="font-size:11.5px;color:var(--color-muted)">${escapeHtml(l.syncHelp)}</div>
              <button type="button" class="btn btn-secondary" id="syncNowBtn" ${currentUser ? "" : "disabled"}>${escapeHtml(l.syncNowBtn)}</button>
            </div>
          </div>

          ${deferredInstallPrompt ? `
          <div>
            <button type="button" class="btn btn-primary btn-block" id="installAppBtn">
              ${icon("download-cloud")}
              ${escapeHtml(l.installAppBtn)}
            </button>
          </div>` : ""}

          <div>
            <div class="settings-section-label">${escapeHtml(l.dataSection)}</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <button type="button" class="btn btn-secondary btn-block" id="exportCsvBtn">
                ${icon("download")}
                ${escapeHtml(l.exportCsvBtn)}
              </button>
              <button type="button" class="btn btn-secondary btn-block" id="exportJsonBtn">
                ${icon("download")}
                ${escapeHtml(l.exportJsonBtn)}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="section-add-row">
          <div class="settings-section-label" style="margin:0">${escapeHtml(l.budgetsSection)}</div>
          <button type="button" class="btn btn-ghost" id="addBudgetBtn">${escapeHtml(l.addBudgetBtn)}</button>
        </div>
        <div id="budgetFormSlot">${budgetFormHtml()}</div>
        <div class="list-card">
          ${budgets.map(budgetRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noBudgets)}</div>`}
        </div>
      </div>

      <div>
        <div class="section-add-row">
          <div class="settings-section-label" style="margin:0">${escapeHtml(l.billsSection)}</div>
          <button type="button" class="btn btn-ghost" id="addBillBtn">${escapeHtml(l.addBillBtn)}</button>
        </div>
        <div id="billFormSlot">${billFormHtml()}</div>
        <div class="list-card">
          ${bills.map(billRowHtml).join("") || `<div class="empty-note">${escapeHtml(l.noBills)}</div>`}
        </div>
      </div>

      <div>
        <div class="section-add-row">
          <div class="settings-section-label" style="margin:0">${escapeHtml(l.goalsSection)}</div>
          <button type="button" class="btn btn-ghost" id="addGoalBtn">${escapeHtml(l.addGoalBtn)}</button>
        </div>
        <div id="goalFormSlot">${state.goalEditId ? goalFormHtml() : ""}</div>
        <div class="insight-cards" style="padding-bottom:0">
          ${goals.map(goalCardHtml).join("") || `<div class="empty-note">${escapeHtml(l.noGoals)}</div>`}
        </div>
      </div>

      <p class="footer-note">${escapeHtml(l.footerNote)}</p>
    </div>
  `;

  $("authBtn").addEventListener("click", () => { currentUser ? signOutUser() : signInWithGoogle(); });
  document.querySelectorAll('input[name="lang-switch"]').forEach((r) => r.addEventListener("change", (e) => { state.lang = e.target.value; saveSettings(); renderChrome(); renderScreen(); }));
  $("darkSwitch").addEventListener("click", () => { state.dark = !state.dark; saveSettings(); applyTheme(); renderScreen(); });
  $("syncNowBtn").addEventListener("click", syncNow);
  if ($("installAppBtn")) $("installAppBtn").addEventListener("click", function () {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      deferredInstallPrompt = null;
      renderSettings();
    });
  });
  $("exportCsvBtn").addEventListener("click", function () {
    const l = L();
    const header = [l.csvDate, l.csvType, l.csvCategory, l.csvNote, l.csvAmount];
    const rows = transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) =>
      [t.date, t.type === "income" ? L().incomeLabel : L().expenseLabel, t.category, t.note || "", t.amount].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","));
    const blob = new Blob(["﻿" + header.join(",") + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "transactions.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    showToast(L().toastCsv);
  });
  $("exportJsonBtn").addEventListener("click", function () {
    const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "transactions.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    showToast(L().toastJson);
  });

  wireInlineCrud("Budget", "budgetEditId", deleteBudget, saveBudgetForm);
  wireInlineCrud("Bill", "billEditId", deleteBill, saveBillForm);
  wireInlineCrud("Goal", "goalEditId", deleteGoal, saveGoalForm, () => { state.goalContributeId = null; });
  document.querySelectorAll("[data-contribute-goal]").forEach((btn) => btn.addEventListener("click", () => { state.goalContributeId = btn.getAttribute("data-contribute-goal"); state.goalEditId = null; renderSettings(); }));
  if ($("saveContributeBtn")) $("saveContributeBtn").addEventListener("click", saveContribution);
  if ($("cancelContributeBtn")) $("cancelContributeBtn").addEventListener("click", () => { state.goalContributeId = null; renderSettings(); });
  refreshIcons();
}

// ---------- tab routing ----------
function setTab(tab) {
  state.tab = tab;
  renderScreen();
}
function renderScreen() {
  if (state.tab === "home") renderHome();
  else if (state.tab === "transactions") renderTransactions();
  else if (state.tab === "add") renderAdd();
  else if (state.tab === "insights") renderInsights();
  else if (state.tab === "settings") renderSettings();
  renderChrome();
}

// ---------- boot ----------
loadFromStorage();
applyTheme();
renderScreen();
refreshIcons();

document.querySelectorAll("#tabbar button").forEach((btn) => btn.addEventListener("click", () => {
  if (btn.getAttribute("data-tab") === "add") resetForm();
  setTab(btn.getAttribute("data-tab"));
}));

window.addEventListener("online", syncNow);
window.addEventListener("offline", () => setSyncStatus(L().syncOffline, false));
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") syncNow(); });
setInterval(syncNow, 25000);

if (sb) {
  sb.auth.onAuthStateChange(function (event, session) {
    currentUser = session ? session.user : null;
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, "", window.location.origin + window.location.pathname);
    }
    if (state.tab === "settings" && !hasLiveInputRisk()) renderSettings();
    if (currentUser) syncNow();
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  // When a newly-deployed service worker takes over an already-open tab
  // (e.g. the tab that was sitting open before/during a Google sign-in
  // redirect), reload once so the page picks up the new app shell instead
  // of silently continuing to render whatever version it was loaded with.
  let swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swRefreshing) return;
    swRefreshing = true;
    window.location.reload();
  });
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (state.tab === "settings" && !hasLiveInputRisk()) renderSettings();
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  if (state.tab === "settings" && !hasLiveInputRisk()) renderSettings();
});
