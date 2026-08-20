# quadtree

Procedural terrain → contour maps → quadtree pathfinding. A zinc/slate-themed
web app, forked from [theabbie/quadtree](https://github.com/theabbie/quadtree).

![theme](https://img.shields.io/badge/theme-zinc%2Fslate-27272a) ![deps](https://img.shields.io/badge/deps-three.js%20(vendored)-38bdf8)

## Pipeline

1. **Random terrain** — seeded value-noise fBm (octaves, lacunarity 2, gain 0.5)
   with an optional radial island falloff, normalised to a 256×256 elevation field.
2. **Contour map** — marching squares over the elevation field with linearly
   interpolated edge crossings, hypsometric band fill, index contours every
   5th line and an emphasised waterline.
3. **3D terrain** — the same height field displaces a Three.js mesh with
   slate-palette vertex colours, slope shading, fog, orbit controls and a
   translucent water sheet.
4. **Quadtree pathfinding** — the walkability grid (above water ∧ slope ≤
   threshold) is recursively decomposed into uniform quadrants; A* runs over
   the walkable leaf adjacency graph (built by edge-sampling point location),
   then the leaf-centre path is string-pulled with grid line-of-sight.
   A 4-connected grid A* baseline runs alongside for comparison stats.

Typical result: **~7–9× fewer nodes explored** than grid A*, sub-millisecond
queries on a 256×256 map.

## Run it

No build step. Either open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

## Controls

| Control | Effect |
| --- | --- |
| Seed / Scale / Octaves / Island falloff | Terrain generation |
| Interval / Hypsometric fill | Contour map styling |
| Water level / Max slope | Walkability (rebuilds the quadtree) |
| Show quadtree / explored nodes | Debug overlays |
| Left-click map | Set start (auto-snaps to nearest routable cell) |
| Right-click / ⇧-click | Set goal |

## Files

```
index.html          app shell
css/style.css       zinc/slate theme
js/noise.js         seeded PRNG + value noise + fBm
js/heightmap.js     elevation field, slope, walkability, palette
js/contours.js      marching squares + topo renderer
js/quadtree.js      decomposition + leaf adjacency graph
js/astar.js         quadtree A*, grid A* baseline, LOS smoothing
js/terrain3d.js     Three.js terrain scene
js/main.js          UI wiring
vendor/             three.js r147 + OrbitControls (UMD, offline-friendly)
```

## License

MIT — see [LICENSE](LICENSE). Original repo by [@theabbie](https://github.com/theabbie).
