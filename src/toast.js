import { $, escapeHtml } from "./utils.js";
import { L } from "./i18n.js";

let toastTimer = null;
export function showToast(msg, undoFn) {
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
