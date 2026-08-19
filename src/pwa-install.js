// PWA install-prompt state (the beforeinstallprompt event, captured so it
// can be replayed later from a button click). Kept separate from sync.js's
// currentUser -- despite living right next to it in the original file,
// it's unrelated to Supabase sync.
export let deferredInstallPrompt = null;
export function setDeferredInstallPrompt(e) { deferredInstallPrompt = e; }
