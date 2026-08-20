/* Quadtree decomposition of the walkability grid + leaf adjacency graph.
 * Global namespace: QT.quadtree */
(function () {
  'use strict';

  const MIN_SIZE = 2; // smallest leaf edge (grid cells)

  let nextId = 0;

  function Node(x, y, size) {
    this.id = nextId++;
    this.x = x; this.y = y; this.size = size;
    this.children = null;      // [tl, tr, bl, br] or null = leaf
    this.walkable = false;     // leaf flag: fully walkable?
    this.neighbors = [];       // leaf adjacency (walkable leaves only)
    this.cx = x + size / 2;    // centre, used as graph position
    this.cy = y + size / 2;
  }

  /* Build the tree from a Uint8 walkability grid (N = 2^k). */
  function build(walk) {
    const N = QT.heightmap.GRID;
    nextId = 0;

    function regionUniform(x, y, size) {
      const first = walk[y * N + x];
      for (let j = y; j < y + size; j++) {
        for (let i = x; i < x + size; i++) {
          if (walk[j * N + i] !== first) return -1;
        }
      }
      return first;
    }

    function subdivide(x, y, size) {
      const node = new Node(x, y, size);
      const u = regionUniform(x, y, size);
      if (u !== -1 || size <= MIN_SIZE) {
        // uniform — or mixed but at min size: majority vote
        if (u === -1) {
          let count = 0;
          for (let j = y; j < y + size; j++)
            for (let i = x; i < x + size; i++) count += walk[j * N + i];
          node.walkable = count * 2 > size * size;
        } else {
          node.walkable = u === 1;
        }
        return node;
      }
      const h = size / 2;
      node.children = [
        subdivide(x, y, h),         // TL
        subdivide(x + h, y, h),     // TR
        subdivide(x, y + h, h),     // BL
        subdivide(x + h, y + h, h), // BR
      ];
      return node;
    }

    const root = subdivide(0, 0, N);
    return root;
  }

  /* Collect leaves (optionally walkable only). */
  function leaves(root, walkableOnly) {
    const out = [];
    (function dfs(n) {
      if (!n.children) {
        if (!walkableOnly || n.walkable) out.push(n);
        return;
      }
      n.children.forEach(dfs);
    })(root);
    return out;
  }

  /* Point location: leaf containing grid point (px, py). */
  function locate(root, px, py) {
    let n = root;
    while (n.children) {
      const h = n.size / 2;
      const right = px >= n.x + h;
      const bottom = py >= n.y + h;
      n = n.children[(bottom ? 2 : 0) + (right ? 1 : 0)];
    }
    return n;
  }

  /* Build adjacency between walkable leaves.
   * For each leaf edge, sample just across the boundary per unit cell and
   * point-locate the neighbour leaf (handles any size difference). */
  function buildGraph(root, walkableLeaves) {
    const N = QT.heightmap.GRID;
    for (const leaf of walkableLeaves) {
      const seen = new Set();
      const s = leaf.size;
      for (let i = 0; i < s; i++) {
        // east edge
        if (leaf.x + s < N) seen.add(locate(root, leaf.x + s + 0.5, leaf.y + i + 0.5));
        // west edge
        if (leaf.x > 0)     seen.add(locate(root, leaf.x - 0.5, leaf.y + i + 0.5));
        // south edge
        if (leaf.y + s < N) seen.add(locate(root, leaf.x + i + 0.5, leaf.y + s + 0.5));
        // north edge
        if (leaf.y > 0)     seen.add(locate(root, leaf.x + i + 0.5, leaf.y - 0.5));
      }
      seen.delete(leaf);
      leaf.neighbors = [...seen].filter(n => n.walkable);
    }
  }

  QT.quadtree = { MIN_SIZE, build, leaves, locate, buildGraph };
})();
