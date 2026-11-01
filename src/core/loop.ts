/**
 * Calls `step` at a fixed rate and `draw` once per animation frame.
 * A frame gap longer than a quarter second (a hidden tab) is dropped, not replayed.
 */
export function runFixedLoop(stepSeconds: number, step: (dt: number) => void, draw: () => void): void {
  let last = performance.now();
  let pending = 0;
  const frame = (now: number) => {
    pending += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (pending >= stepSeconds) {
      step(stepSeconds);
      pending -= stepSeconds;
    }
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
