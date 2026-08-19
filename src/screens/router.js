import { state } from "../state.js";
import { L } from "../i18n.js";

// Screens are registered at boot (see registerRenderers), not statically
// imported here -- each screen module needs setTab/renderScreen from this
// module, and a static import in both directions would be circular.
let renderers = null;
export function registerRenderers(r) { renderers = r; }

export function setTab(tab) {
  state.tab = tab;
  renderScreen();
}
export function renderScreen() {
  if (state.tab === "home") renderers.home();
  else if (state.tab === "transactions") renderers.transactions();
  else if (state.tab === "add") renderers.add();
  else if (state.tab === "insights") renderers.insights();
  else if (state.tab === "settings") renderers.settings();
  renderChrome();
}

export function renderChrome() {
  document.title = L().appTitle;
  document.documentElement.lang = state.lang;
  document.querySelectorAll("#tabbar span[data-l]").forEach((el) => { el.textContent = L()[el.getAttribute("data-l")]; });
  document.querySelectorAll("#tabbar button").forEach((btn) => btn.classList.toggle("active", btn.getAttribute("data-tab") === state.tab));
}
