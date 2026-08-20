/* Heightmap generation, slope analysis and walkability.
 * Global namespace: QT.heightmap */
(function () {
  'use strict';

  const GRID = 256; // power of two — quadtree-friendly

  /* Generate GRID×GRID elevation field in [0,1]. */
  function generate(opts) {
    const { seed, scale, octaves, island } = opts;
    const noise2 = QT.noise.makeValueNoise(seed);
    const h = new Float32Array(GRID * GRID);
    const freq = scale * 4 / GRID;
    const cx = (GRID - 1) / 2, cy = (GRID - 1) / 2;
    const maxD = Math.hypot(cx, cy);

    let mn = Infinity, mx = -Infinity;
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        let e = QT.noise.fbm(noise2, x * freq + 100, y * freq + 100, octaves, 2.0, 0.5);
        // slight ridged component for mountain texture
        const r = QT.noise.fbm(noise2, x * freq * 1.7 + 500, y * freq * 1.7 + 500, Math.max(2, octaves - 2), 2.1, 0.5);
        e = e * 0.8 + Math.abs(r - 0.5) * 0.4;
        if (island) {
          const d = Math.hypot(x - cx, y - cy) / maxD; // 0 centre → 1 corner
          e *= Math.max(0, 1 - Math.pow(d, 2.2));
        }
        h[y * GRID + x] = e;
        if (e < mn) mn = e;
        if (e > mx) mx = e;
      }
    }
    const inv = 1 / (mx - mn || 1);
    for (let i = 0; i < h.length; i++) h[i] = (h[i] - mn) * inv;
    return h;
  }

  /* Max absolute elevation delta to the 4-neighbourhood, per cell. */
  function slopeField(h) {
    const s = new Float32Array(GRID * GRID);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const c = h[y * GRID + x];
        let m = 0;
        if (x > 0)        m = Math.max(m, Math.abs(c - h[y * GRID + x - 1]));
        if (x < GRID - 1) m = Math.max(m, Math.abs(c - h[y * GRID + x + 1]));
        if (y > 0)        m = Math.max(m, Math.abs(c - h[(y - 1) * GRID + x]));
        if (y < GRID - 1) m = Math.max(m, Math.abs(c - h[(y + 1) * GRID + x]));
        s[y * GRID + x] = m;
      }
    }
    return s;
  }

  /* Walkable = above water AND gentle enough slope. Uint8 1/0. */
  function walkability(h, slopes, waterLevel, maxSlope) {
    const w = new Uint8Array(GRID * GRID);
    for (let i = 0; i < w.length; i++) {
      w[i] = (h[i] > waterLevel && slopes[i] <= maxSlope) ? 1 : 0;
    }
    return w;
  }

  /* Hypsometric tint for elevation e (and optional slope shading) — slate palette. */
  function elevationColor(e, water, slope) {
    // [r,g,b] stops, deep water → shore → lowland → highland → rock → peak
    const stops = [
      [0.00, [15, 23, 42]],    // slate-900  (deep water)
      [0.30, [30, 58, 95]],    // slate blue (shallows)
      [0.36, [113, 113, 122]], // zinc-500   (shore)
      [0.50, [82, 82, 91]],    // zinc-600   (lowland)
      [0.68, [63, 63, 70]],    // zinc-700   (highland)
      [0.84, [113, 113, 122]], // zinc-500   (rock)
      [1.00, [244, 244, 245]], // zinc-100   (peak)
    ];
    let c = stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const [e0, c0] = stops[i], [e1, c1] = stops[i + 1];
      if (e >= e0 && e <= e1) {
        const t = (e - e0) / (e1 - e0 || 1);
        c = [0, 1, 2].map(k => c0[k] + (c1[k] - c0[k]) * t);
        break;
      }
    }
    if (slope !== undefined) {
      const shade = Math.max(0.45, 1 - slope * 4.5); // steep → darker
      c = c.map(v => v * shade);
    }
    return c;
  }

  QT.heightmap = { GRID, generate, slopeField, walkability, elevationColor };
})();
