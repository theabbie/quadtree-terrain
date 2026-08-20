/* A* over the quadtree leaf graph, grid A* baseline, LOS path smoothing.
 * Global namespace: QT.astar */
(function () {
  'use strict';

  /* Binary min-heap keyed by f-score. */
  function Heap() {
    this.k = []; this.v = [];
  }
  Heap.prototype.push = function (key, val) {
    const k = this.k, v = this.v;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  };
  Heap.prototype.pop = function () {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  };
  Heap.prototype.size = function () { return this.k.length; };

  /* A* across quadtree leaves. h = height field for slope-weighted costs.
   * Returns { path, explored, cost, ms } or null. */
  function findPath(startLeaf, goalLeaf, h) {
    const t0 = performance.now();
    const g = new Map([[startLeaf.id, 0]]);
    const came = new Map();
    const explored = [];
    const open = new Heap();
    open.push(0, startLeaf);
    const closed = new Set();

    const heuristic = n => Math.hypot(n.cx - goalLeaf.cx, n.cy - goalLeaf.cy);

    while (open.size()) {
      const cur = open.pop();
      if (closed.has(cur.id)) continue;
      closed.add(cur.id);
      explored.push(cur);

      if (cur === goalLeaf) {
        const path = [];
        let n = goalLeaf;
        while (n) { path.push(n); n = came.get(n.id); }
        path.reverse();
        return { path, explored, cost: g.get(goalLeaf.id), ms: performance.now() - t0 };
      }

      const gc = g.get(cur.id);
      for (const nb of cur.neighbors) {
        if (closed.has(nb.id)) continue;
        const dist = Math.hypot(nb.cx - cur.cx, nb.cy - cur.cy);
        // slope penalty: moving uphill costs more
        const dh = Math.abs(h[Math.floor(nb.cy) * QT.heightmap.GRID + Math.floor(nb.cx)] -
                            h[Math.floor(cur.cy) * QT.heightmap.GRID + Math.floor(cur.cx)]);
        const w = dist * (1 + dh * 14);
        const ng = gc + w;
        if (ng < (g.get(nb.id) ?? Infinity)) {
          g.set(nb.id, ng);
          came.set(nb.id, cur);
          open.push(ng + heuristic(nb), nb);
        }
      }
    }
    return { path: null, explored, cost: Infinity, ms: performance.now() - t0 };
  }

  /* Classic 4-connected grid A* baseline (for comparison stats). */
  function gridPath(walk, sx, sy, gx, gy) {
    const t0 = performance.now();
    const N = QT.heightmap.GRID;
    const W = (x, y) => x >= 0 && y >= 0 && x < N && y < N && walk[y * N + x];
    if (!W(sx, sy) || !W(gx, gy)) return { path: null, explored: 0, ms: performance.now() - t0 };

    const g = new Map([[sy * N + sx, 0]]);
    const came = new Map();
    const open = new Heap();
    open.push(0, sy * N + sx);
    const closed = new Set();
    let explored = 0;
    const H = (x, y) => Math.abs(x - gx) + Math.abs(y - gy);

    while (open.size()) {
      const cur = open.pop();
      if (closed.has(cur)) continue;
      closed.add(cur);
      explored++;
      const cx = cur % N, cy = (cur / N) | 0;
      if (cx === gx && cy === gy) {
        const path = [];
        let n = cur;
        while (n !== undefined) { path.push([n % N, (n / N) | 0]); n = came.get(n); }
        path.reverse();
        return { path, explored, ms: performance.now() - t0 };
      }
      const gc = g.get(cur);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!W(nx, ny)) continue;
        const ni = ny * N + nx;
        if (closed.has(ni)) continue;
        const ng = gc + 1;
        if (ng < (g.get(ni) ?? Infinity)) {
          g.set(ni, ng);
          came.set(ni, cur);
          open.push(ng + H(nx, ny), ni);
        }
      }
    }
    return { path: null, explored, ms: performance.now() - t0 };
  }

  /* Line-of-sight on the unit walkability grid (supercover sampling). */
  function los(walk, x0, y0, x1, y1) {
    const N = QT.heightmap.GRID;
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      if (x < 0 || y < 0 || x >= N || y >= N || !walk[y * N + x]) return false;
    }
    return true;
  }

  /* Greedy string-pulling: keep furthest visible waypoint. */
  function smooth(walk, pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let anchor = 0;
    while (anchor < pts.length - 1) {
      let next = anchor + 1;
      for (let i = pts.length - 1; i > anchor + 1; i--) {
        if (los(walk, pts[anchor][0], pts[anchor][1], pts[i][0], pts[i][1])) { next = i; break; }
      }
      out.push(pts[next]);
      anchor = next;
    }
    return out;
  }

  QT.astar = { findPath, gridPath, smooth, los };
})();
