import { state, transactions, budgets, bills, goals, setTransactions, setBudgets, setBills, setGoals } from "./state.js";

export const STORAGE_KEY = "expense_tracker_transactions_v1";
export const SETTINGS_KEY = "expense_tracker_settings_v1";
export let storageAvailable = false;
(function testStorage() {
  try {
    window.localStorage.setItem("__t__", "1");
    window.localStorage.removeItem("__t__");
    storageAvailable = true;
  } catch (e) { storageAvailable = false; }
})();
export function loadFromStorage() {
  if (!storageAvailable) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        setTransactions(data);
        transactions.forEach((t) => { if (!t.updatedAt) t.updatedAt = Date.now(); });
      }
    }
  } catch (e) { /* ignore corrupt data */ }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.lang === "th" || s.lang === "en") state.lang = s.lang;
      if (typeof s.dark === "boolean") state.dark = s.dark;
      if (Array.isArray(s.budgets) && s.budgets.length) setBudgets(s.budgets);
      if (Array.isArray(s.bills) && s.bills.length) setBills(s.bills);
      if (Array.isArray(s.goals)) setGoals(s.goals);
    }
  } catch (e) { /* ignore */ }
}
export function saveToStorage() {
  if (!storageAvailable) return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); } catch (e) { /* quota */ }
}
export function saveSettings() {
  if (!storageAvailable) return;
  try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lang: state.lang, dark: state.dark, budgets, bills, goals })); } catch (e) { /* quota */ }
}
