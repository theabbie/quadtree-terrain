/* Seeded value noise + fractional Brownian motion (fBm).
 * Global namespace: QT.noise */
(function () {
  'use strict';
  window.QT = window.QT || {};

  /* mulberry32 — small fast seeded PRNG */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Build a permutation-free hash lattice from the seed. */
  function makeValueNoise(seed) {
    const rand = mulberry32(seed);
    const SIZE = 256, MASK = SIZE - 1;
    const values = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < values.length; i++) values[i] = rand();

    function lattice(ix, iy) {
      return values[((iy & MASK) << 8) | (ix & MASK)];
    }
    function smooth(t) { return t * t * t * (t * (t * 6 - 15) + 10); } // quintic

    return function noise2(x, y) {
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0;
      const v00 = lattice(x0, y0),     v10 = lattice(x0 + 1, y0);
      const v01 = lattice(x0, y0 + 1), v11 = lattice(x0 + 1, y0 + 1);
      const sx = smooth(fx), sy = smooth(fy);
      const a = v00 + (v10 - v00) * sx;
      const b = v01 + (v11 - v01) * sx;
      return a + (b - a) * sy; // [0,1)
    };
  }

  /* fBm: sum of octaves, output renormalised to ~[0,1] */
  function fbm(noise2, x, y, octaves, lacunarity, gain) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  QT.noise = { mulberry32, makeValueNoise, fbm };
})();
