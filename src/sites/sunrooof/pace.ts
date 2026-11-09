// Page scroll is not story time: the moments worth looking at take more scrolling, the transitions between them less.

/** [where a stretch of the story starts, how much scrolling it gets]. Higher is slower. */
const DWELL: [number, number][] = [
  [0, .7],     // headline
  [.075, .45], // the product flies in
  [.21, 1.2],  // it docks and switches on
  [.25, 1.1],  // dawn
  [.335, 1],   // light from far away
  [.415, .5],  // down to the stage
  [.47, 1.6],  // it comes apart
  [.54, 2],    // exploded, with its parts named
  [.62, 1],    // back together
  [.71, 1],    // daylight
  [.825, 1],   // golden hour
  [.895, .7],  // the camera pulls out
  [.945, 1.2], // the building
];

// Blurring the steps makes speed change gradually, so the scroll eases between stretches with no visible gear change.
const N = 2048, R = 64;
let w = Float32Array.from({ length: N }, (_, i) => { let v = 1; for (const [a, k] of DWELL) if ((i + .5) / N >= a) v = k; return v; });
for (let pass = 0; pass < 3; pass++) {
  const b = new Float32Array(N);
  for (let i = 0; i < N; i++) { let t = 0; for (let j = -R; j <= R; j++) t += w[Math.min(N - 1, Math.max(0, i + j))]; b[i] = t / (2 * R + 1); }
  w = b;
}
const S = new Float32Array(N + 1); for (let i = 0; i < N; i++) S[i + 1] = S[i] + w[i];
const P = new Float32Array(N + 1);
for (let i = 0, j = 0; i <= N; i++) { const s = i / N * S[N]; while (j < N - 1 && S[j + 1] < s) j++; P[i] = (j + (s - S[j]) / (S[j + 1] - S[j])) / N; }

/** Story position (0 to 1) for a page scroll position (0 to 1). */
export const paceAt = (s: number) => { const x = Math.min(1, Math.max(0, s)) * N, i = Math.min(N - 1, x | 0); return P[i] + (P[i + 1] - P[i]) * (x - i); };
