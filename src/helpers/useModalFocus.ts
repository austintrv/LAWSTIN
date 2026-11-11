import { useEffect, useRef } from "react";

type Modal = { node: HTMLElement; previous: HTMLElement | null };
const stack: Modal[] = [];
const inerted = new Map<HTMLElement, boolean>();
const visible = (el: HTMLElement) => !!el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && !el.closest('[hidden], [inert], [aria-hidden="true"]');
const top = () => [...stack].reverse().find(m => m.node.isConnected && m.node.getClientRects().length && getComputedStyle(m.node).display !== "none");
function restoreInert() { inerted.forEach((had, el) => { if (!had) el.removeAttribute("inert"); }); inerted.clear(); }
function isolate() {
  restoreInert();
  let node = top()?.node;
  while (node && node !== document.body) {
    for (const sibling of node.parentElement?.children ?? []) {
      if (sibling === node || !(sibling instanceof HTMLElement) || /^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) continue;
      inerted.set(sibling, sibling.hasAttribute("inert")); sibling.setAttribute("inert", "");
    }
    node = node.parentElement ?? undefined;
  }
}
const focusable = (node: HTMLElement) => [...node.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, summary, [tabindex], [contenteditable="true"]')]
  .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && visible(el));
function trap(e: KeyboardEvent) {
  if (e.key !== "Tab") return;
  const modal = top(); if (!modal) return;
  const nodes = focusable(modal.node), first = nodes[0], last = nodes[nodes.length - 1];
  if (!first) { e.preventDefault(); modal.node.focus({ preventScroll: true }); return; }
  if (!modal.node.contains(document.activeElement) || document.activeElement === modal.node || (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
    e.preventDefault(); (e.shiftKey ? last : first).focus({ preventScroll: true });
  }
}
function contain(e: FocusEvent) {
  const modal = top();
  if (modal && !modal.node.contains(e.target as Node)) (focusable(modal.node)[0] ?? modal.node).focus({ preventScroll: true });
}

export function useModalFocus<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const modal = { node: ref.current, previous: document.activeElement as HTMLElement | null };
    stack.push(modal); isolate();
    if (stack.length === 1) { window.addEventListener("keydown", trap, true); document.addEventListener("focusin", contain); }
    if (!modal.node.contains(document.activeElement)) modal.node.focus({ preventScroll: true });
    return () => {
      const wasTop = stack[stack.length - 1] === modal;
      stack.splice(stack.indexOf(modal), 1); isolate();
      if (!stack.length) { window.removeEventListener("keydown", trap, true); document.removeEventListener("focusin", contain); }
      if (wasTop) {
        const next = top();
        const target = modal.previous?.isConnected && visible(modal.previous) && (!next || next.node.contains(modal.previous)) ? modal.previous : next?.node;
        target?.focus({ preventScroll: true });
      }
    };
  }, [active]);
  return ref;
}
