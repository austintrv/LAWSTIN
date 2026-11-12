import { haptic } from "./haptics";
export const motionAllowed = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export async function confirmFeedback(node?: Element | null, wrong = false) {
  if (!motionAllowed()) return;
  haptic();
  if (!(node instanceof HTMLElement)) return;
  const frames = wrong ? [0,-5,4,-2,0].map(x => ({transform:`translateX(${x}px)`})) : [1,.97,1.025,1].map(x => ({transform:`scale(${x})`}));
  await node.animate(frames,{duration:240,easing:"ease-out"}).finished.catch(() => {});
}
export async function answerFeedback(root: HTMLElement | null, chosen: string, answer: string) {
  if (!root || !motionAllowed()) return;
  const right = root.querySelector<HTMLElement>(`[data-choice="${answer}"]`);
  if (right) right.dataset.feedback = "right";
  const pick = root.querySelector<HTMLElement>(`[data-choice="${chosen}"]`);
  if (pick && chosen !== answer) pick.dataset.feedback = "wrong";
  await confirmFeedback(pick, chosen !== answer);
}
