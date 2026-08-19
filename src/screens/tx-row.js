import { L } from "../i18n.js";
import { iconFor, rowTone } from "../categories.js";
import { iconAvatar, escapeHtml, dateLabel, fmtMoney, EDIT_ICON, DELETE_ICON } from "../utils.js";
import { editTx, deleteTx } from "./add.js";

export function txRowHtml(t) {
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
export function wireTxRowActions() {
  document.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => editTx(btn.getAttribute("data-edit"))));
  document.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => deleteTx(btn.getAttribute("data-delete"))));
}
