import { useEffect, useRef } from "react";

/**
 * Lets the browser or system Back close the overlay on top (quiz, sheets, flashcards, Ask)
 * instead of leaving the app. All open overlays share one history entry: Back closes the top
 * one and, if others remain, the entry is pushed again. Closing from the UI removes the entry
 * once nothing is left open. onBack returns false to stay open (an exam switching to results).
 */
type Entry = { back: () => boolean | void };
const stack: Entry[] = [];
let owned = false;
// True while our own history.back() is on its way; its popstate is not a user Back.
let backing = false;
let listening = false;
// Navigation waiting for an overlay's history entry to be removed first.
let after: (() => void)[] = [];
function flushAfter() { const fns = after; after = []; fns.forEach((f) => f()); }

function push() {
  history.pushState({ lawstinOverlay: true }, "");
  owned = true;
}

function settle() {
  backing = false;
  if (stack.length && !owned) push();
  flushAfter();
}

function onPop() {
  if (backing) { settle(); return; }
  if (!owned) return;
  owned = false;
  const top = stack[stack.length - 1];
  if (!top) return;
  if (top.back() === false) { push(); return; }
  const at = stack.indexOf(top);
  if (at >= 0) stack.splice(at, 1);
  if (stack.length) push();
}

function register(entry: Entry) {
  if (!listening) { window.addEventListener("popstate", onPop); listening = true; }
  stack.push(entry);
  if (!owned && !backing) push();
}

function unregister(entry: Entry) {
  const at = stack.indexOf(entry);
  if (at < 0) return;
  stack.splice(at, 1);
  // Wait a tick so an overlay that replaces another (exam sheet → quiz) reuses the entry.
  setTimeout(() => {
    if (stack.length || !owned) { flushAfter(); return; }
    owned = false;
    backing = true;
    history.back();
    setTimeout(() => { if (backing) settle(); }, 1000);
  }, 0);
}

/** Runs fn (for example a route change) once the closing overlay's history entry is gone. */
export function afterOverlayClose(fn: () => void) {
  if (owned || backing) after.push(fn); else fn();
}

export function useBackClose(onBack: () => boolean | void, active = true) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    const entry: Entry = { back: () => ref.current() };
    register(entry);
    return () => unregister(entry);
  }, [active]);
}
