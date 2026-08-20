/* App wiring: state, generation pipeline, views, interaction. */
(function () {
  'use strict';

  const N = QT.heightmap.GRID;
  const $ = id => document.getElementById(id);

  const state = {
    h: null, slopes: null, walk: null,
    root: null, leavesAll: [], leavesWalk: [],
    start: null, goal: null,
    result: null, gridResult: null,
  };

  // ---------- UI helpers ----------
  function bindRange(id, fn) {
    const el = $(id), out = $(id + 'Out');
    el.addEventListener('input', () => { out.textContent = el.value; fn(parseFloat(el.value)); });
  }

  function fitCanvas(canvas) {
    const pad = 28;
    const vw = canvas.parentElement.clientWidth - pad;
    const vh = canvas.parentElement.clientHeight - pad;
    const s = Math.max(64, Math.min(vw, vh));
    canvas.style.width = s + 'px';
    canvas.style.height = s + 'px';
  }

  // ---------- pipeline ----------
  function regenerate() {
    const t0 = performance.now();
    state.h = QT.heightmap.generate({
      seed: parseInt($('seed').value, 10) || 0,
      scale: parseFloat($('scale').value),
      octaves: parseInt($('octaves').value, 10),
      island: $('island').checked,
    });
    state.slopes = QT.heightmap.slopeField(state.h);
    rebuildWalkability();
    if (QT.terrain3d.built) {
      QT.terrain3d.build(state.h, parseFloat($('water').value));
      syncPathTo3d();
    }
    console.log(`terrain generated in ${(performance.now() - t0).toFixed(1)}ms`);
  }

  function rebuildWalkability() {
    const water = parseFloat($('water').value);
    const maxSlope = parseFloat($('maxSlope').value);
    state.walk = QT.heightmap.walkability(state.h, state.slopes, water, maxSlope);

    const t0 = performance.now();
    state.root = QT.quadtree.build(state.walk);
    state.leavesAll = QT.quadtree.leaves(state.root, false);
    state.leavesWalk = QT.quadtree.leaves(state.root, true);
    QT.quadtree.buildGraph(state.root, state.leavesWalk);
    const ms = performance.now() - t0;
    console.log(`quadtree: ${state.leavesAll.length} leaves (${state.leavesWalk.length} walkable) in ${ms.toFixed(1)}ms`);

    state.result = null;
    snapEndpoints();
    drawContours();
    drawPathfinding();
  }

  /* snap a point to the nearest cell inside a *walkable leaf*
   * (a lone walkable cell in a majority-blocked min-size leaf is not routable) */
  function snapToWalkable(x, y) {
    x = Math.max(0, Math.min(N - 1, x | 0));
    y = Math.max(0, Math.min(N - 1, y | 0));
    const ok = (cx, cy) =>
      state.walk[cy * N + cx] &&
      (!state.root || QT.quadtree.locate(state.root, cx, cy).walkable);
    if (ok(x, y)) return [x, y];
    for (let r = 1; r < 60; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < N && ny < N && ok(nx, ny)) return [nx, ny];
        }
      }
    }
    return null;
  }

  function snapEndpoints() {
    if (state.start) state.start = snapToWalkable(state.start[0], state.start[1]);
    if (state.goal) state.goal = snapToWalkable(state.goal[0], state.goal[1]);
  }

  // ---------- contour view ----------
  function drawContours() {
    if (!state.h) return;
    const canvas = $('contourCanvas');
    fitCanvas(canvas);
    QT.contours.render(canvas, state.h, {
      water: parseFloat($('water').value),
      interval: parseFloat($('interval').value),
      fillBands: $('fillBands').checked,
    });
  }

  // ---------- pathfinding view ----------
  function drawPathfinding() {
    if (!state.h) return;
    const canvas = $('pathCanvas');
    fitCanvas(canvas);
    canvas.width = N; canvas.height = N;
    const ctx = canvas.getContext('2d');
    const water = parseFloat($('water').value);

    // base: elevation tint, blocked cells darkened, water slate
    const img = ctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const e = state.h[i];
      let [r, g, b] = QT.heightmap.elevationColor(e, water);
      if (e > water && !state.walk[i]) { r = 40; g = 40; b = 46; }        // too steep
      if (e <= water) { r *= 0.9; g *= 0.9; b *= 0.95; }
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // quadtree overlay
    if ($('showTree').checked) {
      ctx.strokeStyle = 'rgba(244, 244, 245, 0.16)';
      ctx.lineWidth = 0.5;
      for (const leaf of state.leavesAll) {
        ctx.strokeRect(leaf.x + 0.25, leaf.y + 0.25, leaf.size - 0.5, leaf.size - 0.5);
      }
    }

    // explored nodes
    if (state.result && $('showExplored').checked) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.13)';
      for (const n of state.result.explored) {
        ctx.fillRect(n.x, n.y, n.size, n.size);
      }
    }

    // path
    if (state.result && state.result.path) {
      const pts = state.smoothPath;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + 0.5, y + 0.5) : ctx.moveTo(x + 0.5, y + 0.5)));
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // markers
    const marker = (p, color) => {
      if (!p) return;
      ctx.fillStyle = color;
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p[0] + 0.5, p[1] + 0.5, 4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    };
    marker(state.start, '#34d399');
    marker(state.goal, '#fb7185');
  }

  // ---------- pathfinding ----------
  function runPathfinding() {
    if (!state.start || !state.goal) {
      $('stats').textContent = 'set a start and goal first — click the map';
      return;
    }
    const [sx, sy] = state.start, [gx, gy] = state.goal;
    const startLeaf = QT.quadtree.locate(state.root, sx, sy);
    const goalLeaf = QT.quadtree.locate(state.root, gx, gy);

    state.result = QT.astar.findPath(startLeaf, goalLeaf, state.h);
    state.gridResult = QT.astar.gridPath(state.walk, sx, sy, gx, gy);

    if (state.result.path) {
      const raw = state.result.path.map(n => [n.cx, n.cy]);
      state.smoothPath = QT.astar.smooth(state.walk, [[sx, sy], ...raw, [gx, gy]]);
      // length along smoothed path
      let len = 0;
      for (let i = 1; i < state.smoothPath.length; i++) {
        len += Math.hypot(state.smoothPath[i][0] - state.smoothPath[i - 1][0],
                          state.smoothPath[i][1] - state.smoothPath[i - 1][1]);
      }
      const r = state.result, gr = state.gridResult;
      $('stats').innerHTML =
        `<span class="hi">quadtree A*</span>\n` +
        `  leaves    ${state.leavesWalk.length} walkable / ${state.leavesAll.length} total\n` +
        `  explored  ${r.explored.length} nodes\n` +
        `  length    ${len.toFixed(1)} cells\n` +
        `  time      ${r.ms.toFixed(2)} ms\n` +
        `<span class="ok">grid A* baseline</span>\n` +
        `  explored  ${gr.explored} cells\n` +
        `  time      ${gr.ms.toFixed(2)} ms\n` +
        (gr.explored ? `<span class="hi">speedup   ${(gr.explored / r.explored.length).toFixed(1)}× fewer nodes</span>` : '');
    } else {
      state.smoothPath = null;
      $('stats').innerHTML = `<span class="bad">no path found</span> — explored ${state.result.explored.length} nodes`;
    }
    drawPathfinding();
    syncPathTo3d();
  }

  function syncPathTo3d() {
    if (!QT.terrain3d.built) return;
    if (state.smoothPath) {
      QT.terrain3d.showPath(state.h, state.smoothPath, state.start, state.goal);
    } else {
      QT.terrain3d.showPath(state.h, null, state.start, state.goal);
    }
  }

  // ---------- map interaction ----------
  function canvasPoint(canvas, ev) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left) / r.width * N);
    const y = Math.floor((ev.clientY - r.top) / r.height * N);
    return [Math.max(0, Math.min(N - 1, x)), Math.max(0, Math.min(N - 1, y))];
  }

  function onMapClick(ev) {
    const canvas = $('pathCanvas');
    const [x, y] = canvasPoint(canvas, ev);
    const snapped = snapToWalkable(x, y);
    if (!snapped) return;
    if (ev.button === 2 || ev.shiftKey) state.goal = snapped;
    else state.start = snapped;
    state.result = null; state.smoothPath = null;
    drawPathfinding();
    syncPathTo3d();
    if (state.start && state.goal) runPathfinding();
  }

  // ---------- tabs ----------
  function switchView(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    $('contourControls').classList.toggle('hidden', name !== 'contours');
    $('pathControls').classList.toggle('hidden', name !== 'pathfinding');

    if (name === 'terrain' && !QT.terrain3d.built) {
      QT.terrain3d.init($('terrainHost'));
      QT.terrain3d.build(state.h, parseFloat($('water').value));
      syncPathTo3d();
    }
    if (name === 'terrain') setTimeout(() => QT.terrain3d.resize(), 30);
    if (name === 'contours') drawContours();
    if (name === 'pathfinding') drawPathfinding();
  }

  // ---------- boot ----------
  function boot() {
    document.querySelectorAll('.tab').forEach(t =>
      t.addEventListener('click', () => switchView(t.dataset.view)));

    $('regen').addEventListener('click', () => {
      regenerate();
      setDefaultEndpoints();
      runPathfinding();
    });

    bindRange('scale', regenerate);
    bindRange('octaves', () => regenerate());
    $('island').addEventListener('change', regenerate);
    $('seed').addEventListener('change', regenerate);

    bindRange('interval', drawContours);
    $('fillBands').addEventListener('change', drawContours);

    bindRange('water', () => {
      rebuildWalkability();
      if (QT.terrain3d.built) { QT.terrain3d.build(state.h, parseFloat($('water').value)); syncPathTo3d(); }
    });
    bindRange('maxSlope', rebuildWalkability);
    $('showTree').addEventListener('change', drawPathfinding);
    $('showExplored').addEventListener('change', drawPathfinding);

    $('findPath').addEventListener('click', runPathfinding);
    $('clearPath').addEventListener('click', () => {
      state.start = state.goal = state.result = state.smoothPath = null;
      $('stats').textContent = '';
      drawPathfinding();
      syncPathTo3d();
    });

    const pc = $('pathCanvas');
    pc.addEventListener('mousedown', onMapClick);
    pc.addEventListener('contextmenu', ev => ev.preventDefault());

    window.addEventListener('resize', () => {
      drawContours(); drawPathfinding(); QT.terrain3d.resize();
    });

    regenerate();
    switchView('contours');
    setDefaultEndpoints();
    runPathfinding();
  }

  /* demo endpoints on the west/east shores */
  function setDefaultEndpoints() {
    state.start = snapToWalkable(30, 128);
    state.goal = snapToWalkable(226, 128);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
