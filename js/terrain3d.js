/* 3D terrain view — Three.js mesh from the height field, slate/zinc shading.
 * Global namespace: QT.terrain3d */
(function () {
  'use strict';

  const HEIGHT_SCALE = 52;
  let renderer, scene, camera, controls, mesh, water, pathLine, markers, host;
  let built = false;

  function init(hostEl) {
    host = hostEl;
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x09090b);            // zinc-950
    scene.fog = new THREE.Fog(0x09090b, 320, 900);

    camera = new THREE.PerspectiveCamera(52, 1, 0.1, 3000);
    camera.position.set(-170, 150, 210);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(0, 12, 0);

    // lighting — cold slate key light + dim ambient
    const sun = new THREE.DirectionalLight(0xf4f4f5, 1.05);
    sun.position.set(-180, 260, 140);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x334155, 0.85));       // slate-800
    const rim = new THREE.DirectionalLight(0x64748b, 0.35);  // slate-500 rim
    rim.position.set(220, 120, -160);
    scene.add(rim);

    const grid = new THREE.GridHelper(600, 30, 0x27272a, 0x1c1c1f);
    grid.position.y = -0.5;
    scene.add(grid);

    markers = new THREE.Group();
    scene.add(markers);

    window.addEventListener('resize', resize);
    resize();
    animate();
    built = true;
  }

  function resize() {
    if (!renderer || !host) return;
    const w = host.clientWidth || 1, hgt = host.clientHeight || 1;
    renderer.setSize(w, hgt);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  /* (Re)build the terrain mesh from the current height field. */
  function build(h, waterLevel) {
    const N = QT.heightmap.GRID;
    const slopes = QT.heightmap.slopeField(h);

    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    if (water) { scene.remove(water); water.geometry.dispose(); water.material.dispose(); }

    const geo = new THREE.PlaneGeometry(N, N, N - 1, N - 1);
    geo.rotateX(-Math.PI / 2); // xz plane, y up

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const vi = y * N + x;
        const e = h[vi];
        pos.setY(vi, e * HEIGHT_SCALE);
        const [r, g, b] = QT.heightmap.elevationColor(e, waterLevel, slopes[vi]);
        colors[vi * 3] = r / 255;
        colors[vi * 3 + 1] = g / 255;
        colors[vi * 3 + 2] = b / 255;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.94, metalness: 0.04,
    }));
    scene.add(mesh);

    // translucent slate water sheet
    water = new THREE.Mesh(
      new THREE.PlaneGeometry(N * 1.02, N * 1.02),
      new THREE.MeshStandardMaterial({
        color: 0x1e3a5f, transparent: true, opacity: 0.78,
        roughness: 0.25, metalness: 0.35,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = waterLevel * HEIGHT_SCALE;
    scene.add(water);
  }

  /* Draw the computed path as an elevated line + start/goal markers. */
  function showPath(h, pts, start, goal) {
    clearPath();
    if (pts && pts.length > 1) {
      const N = QT.heightmap.GRID;
      const toWorld = p => {
        const [gx, gy] = p;
        const e = h[Math.min(N - 1, Math.round(gy)) * N + Math.min(N - 1, Math.round(gx))];
        return new THREE.Vector3(gx - N / 2, e * HEIGHT_SCALE + 2.6, gy - N / 2);
      };
      // densify for terrain-hugging
      const dense = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      dense.push(pts[pts.length - 1]);
      const geo = new THREE.BufferGeometry().setFromPoints(dense.map(toWorld));
      pathLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 }));
      scene.add(pathLine);
    }
    const addMarker = (p, color) => {
      if (!p) return;
      const N = QT.heightmap.GRID;
      const e = h[p[1] * N + p[0]];
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 16, 16),
        new THREE.MeshBasicMaterial({ color })
      );
      m.position.set(p[0] - N / 2, e * HEIGHT_SCALE + 3.4, p[1] - N / 2);
      markers.add(m);
    };
    addMarker(start, 0x34d399);
    addMarker(goal, 0xfb7185);
  }

  function clearPath() {
    if (pathLine) { scene.remove(pathLine); pathLine.geometry.dispose(); pathLine.material.dispose(); pathLine = null; }
    while (markers && markers.children.length) {
      const m = markers.children.pop();
      m.geometry.dispose(); m.material.dispose();
      markers.remove(m);
    }
  }

  QT.terrain3d = {
    HEIGHT_SCALE,
    init, build, showPath, clearPath, resize,
    get built() { return built; },
  };
})();
