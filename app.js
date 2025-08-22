// High-FPS Three.js scene with stars, planets, and pointer repulsion
(() => {
  const canvas = document.getElementById('scene');
  const fpsEl = document.getElementById('fps');
  const countEl = document.getElementById('count');

  // Scene, camera, renderer
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  camera.position.set(0, 0, 60);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  // Post-processing: Bloom for glow
  const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    samples: renderer.capabilities.isWebGL2 ? 4 : 0
  });
  const composer = new THREE.EffectComposer(renderer, renderTarget);
  const renderPass = new THREE.RenderPass(scene, camera);
  const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.8,   // strength
    0.6,   // radius
    0.0    // threshold
  );
  composer.addPass(renderPass);
  composer.addPass(bloomPass);

  // Lighting
  const light = new THREE.DirectionalLight(0xffffff, 1.1);
  light.position.set(10, 10, 10);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x446688, 0.25));

  // Starfield (Points)
  const STAR_COUNT = 20000;
  const starGeom = new THREE.BufferGeometry();
  const positions = new Float32Array(STAR_COUNT * 3);
  const velocities = new Float32Array(STAR_COUNT * 3); // for subtle motion parallax
  const colors = new Float32Array(STAR_COUNT * 3);

  const sphereDistrib = (rMin, rMax) => {
    // random point in spherical shell
    const r = Math.cbrt(Math.random() * (rMax**3 - rMin**3) + rMin**3);
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = Math.random() * Math.PI * 2;
    return new THREE.Vector3(
      r * Math.sin(theta) * Math.cos(phi),
      r * Math.sin(theta) * Math.sin(phi),
      r * Math.cos(theta)
    );
  };

  for (let i = 0; i < STAR_COUNT; i++) {
    const p = sphereDistrib(50, 500);
    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    // Small random drift velocity
    velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.002;
    velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.002;

    // Star color variation
    const t = Math.random();
    const col = new THREE.Color().setHSL(0.58 + 0.1 * (Math.random() - 0.5), 0.6, 0.6 + 0.3 * (Math.random() - 0.5));
    colors[i * 3 + 0] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  starGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const starMat = new THREE.PointsMaterial({
    size: 0.6,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });

  const stars = new THREE.Points(starGeom, starMat);
  scene.add(stars);

  // Planets
  const planetGroup = new THREE.Group();
  scene.add(planetGroup);

  const makePlanet = (radius, color, textureURL = null) => {
    const geo = new THREE.SphereGeometry(radius, 64, 64);
    let mat;
    if (textureURL) {
      const tex = new THREE.TextureLoader().load(textureURL);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.9,
        metalness: 0.0
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        metalness: 0.0
      });
    }
    const mesh = new THREE.Mesh(geo, mat);
    // subtle glow via sprite
    const glowTex = makeRadialGradientTexture(256);
    const spriteMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(color),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.45
    });
    const glow = new THREE.Sprite(spriteMat);
    glow.scale.set(radius * 6, radius * 6, 1);
    mesh.add(glow);
    return mesh;
  };

  function makeRadialGradientTexture(size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,size,size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const planet1 = makePlanet(5, 0x6aa2ff, 'assets/textures/planet1.jpg'); // blue planet
  const planet2 = makePlanet(3.5, 0xffa15c, 'assets/textures/planet2.jpg'); // warm planet

  planet1.position.set(-18, 0, 0);
  planet2.position.set(22, 8, -10);

  planetGroup.add(planet1);
  planetGroup.add(planet2);

  // Orbits (invisible, we’ll animate positions)
  let tOrbit = 0;

  // Pointer interaction (repel field)
  const pointerNDC = new THREE.Vector2(0, 0); // normalized device coords (-1..1)
  const pointerWorld = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();

  const repel = {
    radius: 25,
    strength: 0.07,
    falloff: 0.8, // 0..1 (closer = stronger)
  };

  // Invisible plane at z=0 for projecting pointer to world space
  const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  function updatePointer(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    pointerNDC.set(x, y);

    raycaster.setFromCamera(pointerNDC, camera);
    const pt = new THREE.Vector3();
    raycaster.ray.intersectPlane(planeZ, pt);
    pointerWorld.copy(pt);
  }

  window.addEventListener('mousemove', (e) => updatePointer(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) {
      updatePointer(e.touches.clientX, e.touches.clientY);
    }
  }, { passive: true });

  // Resize handling
  window.addEventListener('resize', onResize);
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
  }

  // Animation loop
  let last = performance.now();
  let fpsSMA = 60;
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    // Update FPS simple moving average
    const fps = 1 / (dt || 1/60);
    fpsSMA = fpsSMA * 0.9 + fps * 0.1;
    fpsEl.textContent = `FPS: ${fpsSMA.toFixed(0)}`;

    // Star subtle drift + repulsion
    const pos = starGeom.attributes.position.array;
    for (let i = 0; i < STAR_COUNT; i++) {
      const ix = i * 3;
      const x = pos[ix + 0];
      const y = pos[ix + 1];
      const z = pos[ix + 2];

      // Drift
      pos[ix + 0] = x + velocities[ix + 0];
      pos[ix + 1] = y + velocities[ix + 1];
      pos[ix + 2] = z + velocities[ix + 2];

      // Repel within radius projected in z≈0 space
      // Compute distance in 3D but weight Z to keep effect near camera plane
      const dx = pos[ix + 0] - pointerWorld.x;
      const dy = pos[ix + 1] - pointerWorld.y;
      const dz = (pos[ix + 2] - 0) * 0.35; // dampen z-difference
      const dist = Math.hypot(dx, dy, dz);

      if (dist < repel.radius) {
        const f = (1 - dist / repel.radius);
        const s = repel.strength * Math.pow(f, 1.0 + 3.0 * repel.falloff);
        pos[ix + 0] += (dx / (dist + 1e-4)) * s * (15 + 10 * Math.random());
        pos[ix + 1] += (dy / (dist + 1e-4)) * s * (15 + 10 * Math.random());
        // nudge z slightly for parallax shift
        pos[ix + 2] += (dz / (Math.abs(dz) + 1e-4)) * s * 2.0;
      }

      // Wrap stars if they drift too far to keep density
      const r2 = pos[ix + 0]*pos[ix + 0] + pos[ix + 1]*pos[ix + 1] + pos[ix + 2]*pos[ix + 2];
      if (r2 > 600*600) {
        const p = sphereDistrib(100, 500);
        pos[ix + 0] = p.x;
        pos[ix + 1] = p.y;
        pos[ix + 2] = p.z;
      }
    }
    starGeom.attributes.position.needsUpdate = true;

    // Planet orbits and rotation
    tOrbit += dt * 0.25;
    planet1.position.set(Math.cos(tOrbit) * 22, Math.sin(tOrbit * 1.2) * 10, Math.sin(tOrbit) * -8);
    planet2.position.set(Math.cos(tOrbit * 0.7) * -30, Math.sin(tOrbit * 0.9) * 14, Math.cos(tOrbit * 0.5) * 12);

    planet1.rotation.y += dt * 0.25;
    planet2.rotation.y += dt * 0.35;

    planetGroup.rotation.y += dt * 0.05;

    // Slow camera dolly/orbit for depth
    camera.position.z = 60 + Math.sin(now * 0.00025) * 5;
    camera.lookAt(0, 0, 0);

    composer.render();
  }

  requestAnimationFrame(animate);

  // Debug counts
  countEl.textContent = `Stars: ${STAR_COUNT}`;

  // Accessibility: prevent scroll on touch drag
  document.addEventListener('touchmove', (e) => {
    if (e.target === renderer.domElement) e.preventDefault();
  }, { passive: false });

})();
