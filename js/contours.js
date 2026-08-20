/* Marching squares contour extraction + 2D topo-map renderer.
 * Global namespace: QT.contours */
(function () {
  'use strict';

  const GRID = () => QT.heightmap.GRID;

  /* Extract polyline segments for one iso-level from height field h.
   * Returns flat array [x1,y1,x2,y2, ...] in grid coordinates. */
  function marchingSquares(h, level) {
    const N = QT.heightmap.GRID;
    const segs = [];

    for (let y = 0; y < N - 1; y++) {
      for (let x = 0; x < N - 1; x++) {
        const tl = h[y * N + x],         tr = h[y * N + x + 1];
        const bl = h[(y + 1) * N + x],   br = h[(y + 1) * N + x + 1];

        let idx = 0;
        if (bl >= level) idx |= 1;
        if (br >= level) idx |= 2;
        if (tr >= level) idx |= 4;
        if (tl >= level) idx |= 8;
        if (idx === 0 || idx === 15) continue;

        // interpolated crossing points on each edge
        const tT = (level - tl) / (tr - tl || 1e-9);
        const tR = (level - tr) / (br - tr || 1e-9);
        const tB = (level - bl) / (br - bl || 1e-9);
        const tL = (level - tl) / (bl - tl || 1e-9);
        const top    = [x + tT, y];
        const right  = [x + 1, y + tR];
        const bottom = [x + tB, y + 1];
        const left   = [x, y + tL];

        const add = (a, b) => segs.push(a[0], a[1], b[0], b[1]);

        switch (idx) {
          case 1:  case 14: add(left, bottom); break;
          case 2:  case 13: add(bottom, right); break;
          case 3:  case 12: add(left, right); break;
          case 4:  case 11: add(top, right); break;
          case 6:  case 9:  add(top, bottom); break;
          case 7:  case 8:  add(top, left); break;
          case 5: { // saddle: BL + TR inside
            const c = (tl + tr + bl + br) / 4;
            if (c >= level) { add(top, left); add(bottom, right); }
            else            { add(left, bottom); add(top, right); }
            break;
          }
          case 10: { // saddle: TL + BR inside
            const c = (tl + tr + bl + br) / 4;
            if (c >= level) { add(left, bottom); add(top, right); }
            else            { add(top, left); add(bottom, right); }
            break;
          }
        }
      }
    }
    return segs;
  }

  /* Render a full topo map: optional hypsometric band fill + contour lines. */
  function render(canvas, h, opts) {
    const { water, interval, fillBands } = opts;
    const N = QT.heightmap.GRID;
    canvas.width = N; canvas.height = N;
    const ctx = canvas.getContext('2d');

    // --- band fill (per-pixel elevation tint) ---
    if (fillBands) {
      const img = ctx.createImageData(N, N);
      for (let i = 0; i < N * N; i++) {
        const e = h[i];
        // quantise into bands for the classic topo-map look
        const band = Math.floor(e / interval) * interval + interval / 2;
        const [r, g, b] = QT.heightmap.elevationColor(band, water);
        img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    } else {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, N, N);
    }

    // --- contour lines ---
    const start = Math.ceil(0.02 / interval) * interval;
    let k = Math.round(start / interval);
    for (let level = start; level < 0.99; level += interval, k++) {
      const segs = marchingSquares(h, level);
      if (!segs.length) continue;
      const isWater = level < water;
      const isIndex = k % 5 === 0; // every 5th = index contour
      ctx.strokeStyle = isWater
        ? (isIndex ? 'rgba(125, 160, 210, 0.6)' : 'rgba(90, 120, 165, 0.3)')
        : (isIndex ? 'rgba(228, 228, 231, 0.9)'  : 'rgba(161, 161, 170, 0.4)');
      ctx.lineWidth = isIndex ? 1.4 : 0.6;
      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 4) {
        ctx.moveTo(segs[i] + 0.5, segs[i + 1] + 0.5);
        ctx.lineTo(segs[i + 2] + 0.5, segs[i + 3] + 0.5);
      }
      ctx.stroke();
    }

    // --- waterline (level = water) emphasised ---
    const wl = marchingSquares(h, water);
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < wl.length; i += 4) {
      ctx.moveTo(wl[i] + 0.5, wl[i + 1] + 0.5);
      ctx.lineTo(wl[i + 2] + 0.5, wl[i + 3] + 0.5);
    }
    ctx.stroke();
  }

  QT.contours = { marchingSquares, render };
})();
