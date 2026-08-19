import { sb, currentUser } from "./sync.js";

// Lightweight builder-facing error visibility: catches genuinely unhandled
// bugs (not the auth/storage/sync failures already handled with their own
// toasts elsewhere -- those are a separate, already-solved concern) and logs
// them to a Supabase table only the project owner can read (see the
// error_logs migration: insert-only RLS policy for anon/authenticated, no
// select policy at all, so nobody using the app -- including the person who
// hit the error -- can read any error log back through the app's own key).
// Read logs via the Supabase dashboard, not through this app.

const MAX_LOGS_PER_SESSION = 20;
let logCount = 0;

function logError(message, stack) {
  if (!sb || logCount >= MAX_LOGS_PER_SESSION) return;
  logCount++;
  sb.from("error_logs").insert({
    user_id: currentUser ? currentUser.id : null,
    message: String(message).slice(0, 2000),
    stack: stack ? String(stack).slice(0, 8000) : null,
    url: window.location.href,
    user_agent: navigator.userAgent
  }).then(() => {}, () => {}); // fire-and-forget; a failure here must never surface to the user
}

export function initErrorReporting() {
  window.addEventListener("error", (e) => {
    logError(e.message, e.error && e.error.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : null;
    logError(message, stack);
  });
}
