import {
  AdditiveBlending, BufferGeometry, CanvasTexture, CatmullRomCurve3, Float32BufferAttribute, Group, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, Points, PointsMaterial, Quaternion, Raycaster, Scene, SphereGeometry,
  Spherical, SRGBColorSpace, TubeGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { arcPoints, landSegments, toXYZ } from './geo.js';
import { cssColor, layerColor } from './layers.js';

const MAX_ARCS = 30;
const DRAW_SECONDS = 1.2;
const LIFE_SECONDS = 6;
const FADE_SECONDS = 1.5;
const CLICK_PIXELS = 5;

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

function texture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  draw(canvas.getContext('2d'));
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  return map;
}

// Reported IPs are discs, flagged ones are rings, and a soft glow sits under both: the glow is what
// shows density when zoomed out, and the shapes are what tell the two kinds apart without colour.
const SPRITES = {
  disc: () => texture((g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 27, 0, 7); g.fill(); }),
  ring: () => texture((g) => { g.strokeStyle = '#fff'; g.lineWidth = 10; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.stroke(); }),
  glow: () => texture((g) => {
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
  }),
};

function lines(vertices, color, opacity = 1) {
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3));
  return new LineSegments(geometry, new LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

function graticule() {
  const out = [];
  for (let lon = -180; lon < 180; lon += 20) for (let lat = -80; lat < 80; lat += 4) out.push(...toXYZ(lat, lon), ...toXYZ(lat + 4, lon));
  for (let lat = -80; lat <= 80; lat += 20) for (let lon = -180; lon < 180; lon += 4) out.push(...toXYZ(lat, lon), ...toXYZ(lat, lon + 4));
  return lines(out, cssColor('--map-grid'), Number(cssColor('--map-grid-opacity')) || 0.12);
}

function starfield(count = 900) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(...new Vector3().randomDirection().multiplyScalar(20 + Math.random() * 20).toArray());
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(out, 3));
  return new Points(geometry, new PointsMaterial({ color: cssColor('--text-3'), size: 0.07 }));
}

function release(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    child.material?.dispose();
  });
}

function pointCloud(points, material) {
  const positions = points.flatMap((point) => toXYZ(point.lat, point.lon, 1.005));
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
  return new Points(geometry, material);
}

// `interactive: false` is for pages that move the camera themselves (the tour): no dragging, no wheel zoom, no
// auto-rotate, so the page scrolls instead and setView() decides where the camera looks.
// `intro` draws the globe in: grid first, coastlines once they have loaded, then the opaque core.
// `onLoad` fires when the coastlines are in (or failed to load). `maxPixelRatio` trades sharpness for frame rate.
export function createGlobe(element, {
  reducedMotion = false, interactive = true, intro = false, maxPixelRatio = 2, onLoad = () => {}, onHover = () => {}, onSelect = () => {},
} = {}) {
  let reduced = reducedMotion;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  element.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.fromArray(toXYZ(24, -30, 3.4));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = interactive;
  controls.enablePan = false;
  controls.enableDamping = !reduced;
  controls.rotateSpeed = 0.5;
  controls.autoRotate = interactive && !reduced;
  controls.autoRotateSpeed = 0.6;
  controls.minDistance = 1.8;
  controls.maxDistance = 9;

  // An opaque core hides whatever is on the far side, for the eye and for picking
  const core = new Mesh(new SphereGeometry(0.992, 64, 48), new MeshBasicMaterial({ color: cssColor('--bg-globe') }));
  const grid = graticule();
  const gridOpacity = grid.material.opacity;
  scene.add(core, grid, starfield());
  let land = null;
  let drawIn = intro && !reduced ? { t: 0, landAt: null } : null;
  if (drawIn) {
    grid.material.opacity = 0;
    Object.assign(core.material, { transparent: true, opacity: 0 });
  }

  const abort = new AbortController();
  fetch('/geojson/ne_110m_land.json', { signal: abort.signal })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      land = lines(landSegments(data, 1.002), cssColor('--map-land'));
      if (drawIn) Object.assign(land.material, { transparent: true, opacity: 0 });
      scene.add(land);
    })
    .catch((error) => {
      if (error.name !== 'AbortError') console.error('Could not load the world map', error);
    })
    .finally(() => {
      if (abort.signal.aborted) return;
      if (drawIn) drawIn.landAt = Math.max(drawIn.t, 0.6);
      onLoad();
    });

  function drawInStep(delta) {
    if (!drawIn) return;
    drawIn.t += delta;
    grid.material.opacity = gridOpacity * clamp(drawIn.t / 0.8, 0, 1);
    if (drawIn.landAt === null) return;
    const since = drawIn.t - drawIn.landAt;
    if (land) land.material.opacity = clamp(since, 0, 1);
    core.material.opacity = clamp((since - 0.5) / 0.8, 0, 1);
    if (core.material.opacity < 1) return;
    // Done: opaque again, so the core hides the far side and sorts like the dashboard's
    for (const material of [core.material, land?.material]) if (material) Object.assign(material, { transparent: false, needsUpdate: true });
    drawIn = null;
  }

  const sprites = { disc: SPRITES.disc(), ring: SPRITES.ring(), glow: SPRITES.glow() };
  const arcs = [];
  const raycaster = new Raycaster();
  raycaster.params.Points.threshold = 0.025;
  const clouds = { glow: null, discs: null, rings: null };
  let discPoints = [];
  let ringPoints = [];
  let highlight = null;
  let paused = false;
  let view = null;
  let elapsed = 0;
  let last = performance.now();

  const removeCloud = (key) => {
    if (!clouds[key]) return;
    scene.remove(clouds[key]);
    release(clouds[key]);
    clouds[key] = null;
  };

  function removeArc(index) {
    const [arc] = arcs.splice(index, 1);
    scene.remove(arc.group);
    release(arc.group);
  }

  function addArc(event) {
    if (paused || document.hidden) return;
    // `color` (a token name) is for the tour's invented arcs, which belong to no layer
    const color = event.color ? cssColor(event.color) : layerColor(event.layer);
    const from = [event.src_lat, event.src_lon];
    const to = [event.dst_lat, event.dst_lon];
    const path = arcPoints(from, to);

    const group = new Group();
    const material = new MeshBasicMaterial({ color, transparent: true });
    let tube = null;
    let hit = null;
    if (path) {
      const curve = new CatmullRomCurve3(path.map((point) => new Vector3(...point)));
      tube = new Mesh(new TubeGeometry(curve, 64, 0.0045, 5), material);
      // a fatter invisible tube, so a thin arc is easy to point at
      hit = new Mesh(new TubeGeometry(curve, 32, 0.03, 5), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.userData.event = event;
      const source = new Mesh(new SphereGeometry(0.014, 12, 8), material);
      source.position.fromArray(toXYZ(...from, 1.006));
      group.add(tube, hit, source);
    }
    // Domestic attacks have no path, only a pulse
    const target = new Mesh(new SphereGeometry(0.022, 12, 8), material);
    target.position.fromArray(toXYZ(...to, 1.006));
    target.userData.event = event;
    group.add(target);

    scene.add(group);
    arcs.push({ group, material, tube, hit, target, event, born: elapsed });
    if (arcs.length > MAX_ARCS) removeArc(0);
  }

  function setThreats(points) {
    for (const key of Object.keys(clouds)) removeCloud(key);
    discPoints = points.filter((point) => !point.flagged);
    ringPoints = points.filter((point) => point.flagged);
    if (!points.length) return;
    const base = { transparent: true, sizeAttenuation: true, depthWrite: false };
    clouds.glow = pointCloud(points, new PointsMaterial({ ...base, map: sprites.glow, color: cssColor('--data-reported'), size: 0.16, blending: AdditiveBlending, opacity: 0 }));
    clouds.discs = pointCloud(discPoints, new PointsMaterial({ ...base, map: sprites.disc, color: cssColor('--data-reported'), size: 0.026, alphaTest: 0.3 }));
    clouds.rings = pointCloud(ringPoints, new PointsMaterial({ ...base, map: sprites.ring, color: cssColor('--data-flagged'), size: 0.055, alphaTest: 0.3 }));
    scene.add(clouds.glow, clouds.discs, clouds.rings);
  }

  // A persistent outline for the route or point being inspected
  function setHighlight(next) {
    if (highlight) {
      scene.remove(highlight);
      release(highlight);
      highlight = null;
    }
    if (!next) return;
    highlight = new Group();
    const color = cssColor('--focus');
    const mark = (lat, lon) => {
      const cloud = pointCloud([{ lat, lon }], new PointsMaterial({ map: sprites.ring, color, size: 0.09, transparent: true, depthWrite: false, alphaTest: 0.3 }));
      highlight.add(cloud);
    };
    if (next.point) {
      mark(next.point.lat, next.point.lon);
    } else if (next.route) {
      const { src, dst } = next.route;
      const path = arcPoints([src.lat, src.lon], [dst.lat, dst.lon]);
      if (path) {
        const curve = new CatmullRomCurve3(path.map((point) => new Vector3(...point)));
        highlight.add(new Mesh(new TubeGeometry(curve, 64, 0.008, 6), new MeshBasicMaterial({ color })));
      }
      mark(src.lat, src.lon);
      mark(dst.lat, dst.lon);
    }
    scene.add(highlight);
  }

  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
    const wall = raycaster.intersectObject(core)[0]?.distance ?? Infinity;
    const hits = [];
    for (const arc of arcs) {
      for (const object of [arc.hit, arc.target]) if (object) hits.push(...raycaster.intersectObject(object).map((h) => ({ ...h, item: { kind: 'arc', event: arc.event } })));
    }
    for (const [cloud, list] of [[clouds.rings, ringPoints], [clouds.discs, discPoints]]) {
      if (cloud) hits.push(...raycaster.intersectObject(cloud).map((h) => ({ ...h, item: { kind: 'network', point: list[h.index] } })));
    }
    // anything behind the globe's own surface is on the far side
    const best = hits.filter((h) => h.distance < wall + 0.03).sort((a, b) => a.distance - b.distance)[0];
    return best?.item ?? null;
  }

  let frame = 0;
  let down = null;
  const canvas = renderer.domElement;
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (event) => { down = { x: event.clientX, y: event.clientY, at: performance.now() }; });
  canvas.addEventListener('pointerup', (event) => {
    const moved = down && Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (down && moved < CLICK_PIXELS && performance.now() - down.at < 600) onSelect(pick(event.clientX, event.clientY));
    down = null;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (down || event.pointerType === 'touch') return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const item = pick(event.clientX, event.clientY);
      canvas.style.cursor = item ? 'pointer' : 'grab';
      onHover(item, event.clientX, event.clientY);
    });
  });
  canvas.addEventListener('pointerleave', () => { cancelAnimationFrame(frame); onHover(null); });

  function animateArcs() {
    for (let i = arcs.length - 1; i >= 0; i--) {
      const { tube, target, material, born } = arcs[i];
      const age = elapsed - born;
      if (age >= LIFE_SECONDS) {
        removeArc(i);
        continue;
      }
      const progress = reduced ? 1 : Math.min(age / DRAW_SECONDS, 1);
      if (tube) tube.geometry.setDrawRange(0, Math.floor((tube.geometry.index.count / 3) * progress) * 3);
      target.visible = !tube || progress === 1;
      if (!reduced) target.scale.setScalar(1 + 0.4 * Math.sin(age * 6));
      material.opacity = Math.min(1, (LIFE_SECONDS - age) / FADE_SECONDS);
    }
  }

  // Zoomed out, the glow merges dots into a density map. Zoomed in, single dots and rings stand alone.
  function updateDensity() {
    const zoomedOut = clamp((camera.position.length() - 2.6) / 2.4, 0, 1);
    if (clouds.glow) clouds.glow.material.opacity = 0.6 * zoomedOut;
    if (clouds.discs) clouds.discs.material.opacity = 1 - 0.55 * zoomedOut;
    if (clouds.rings) clouds.rings.material.size = 0.055 + 0.03 * zoomedOut;
  }

  // Glide to a view: turn along the shortest great circle and change distance together, eased.
  // Distance is relative to the framing that fits the whole globe, so it holds through resizes.
  function moveCamera(delta) {
    if (!view) return;
    view.t = Math.min(1, view.t + delta / view.duration);
    const eased = 1 - (1 - view.t) ** 3;
    const direction = view.from.clone().applyQuaternion(new Quaternion().slerp(view.turn, eased));
    const length = view.fromLength + ((fitted || view.fromLength) / view.zoom - view.fromLength) * eased;
    camera.position.copy(direction).multiplyScalar(length);
    camera.lookAt(controls.target);
  }
  controls.addEventListener('start', () => { view = null; });

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!paused) elapsed += delta;
    animateArcs();
    updateDensity();
    controls.update(delta);
    moveCamera(delta);
    drawInStep(delta);
    renderer.render(scene, camera);
  });

  let fitted = 0;
  function resize() {
    const { clientWidth: width, clientHeight: height } = element;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const halfAngle = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * Math.min(1, camera.aspect));
    const distance = 1.22 / Math.sin(halfAngle);
    // Scrolling past this left a speck in an empty sky
    controls.maxDistance = distance * 1.4;
    if (Math.abs(distance - fitted) > 0.01) {
      camera.position.setLength(distance);
      fitted = distance;
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(element);
  resize();

  const spin = () => { controls.autoRotate = interactive && !paused && !reduced; };

  return {
    addArc,
    clearArcs() {
      while (arcs.length) removeArc(0);
    },
    setThreats,
    setHighlight,
    // For the tour's own drawings. Returns a function that removes the object and frees its geometry.
    add(object) {
      scene.add(object);
      return () => {
        scene.remove(object);
        release(object);
      };
    },
    setPaused(value) {
      paused = value;
      spin();
      if (!value || reduced) return;
      // Damping would glide on for seconds. An undamped update clears it
      const position = camera.position.clone();
      controls.enableDamping = false;
      controls.update();
      camera.position.copy(position);
      camera.lookAt(controls.target);
      controls.enableDamping = true;
    },
    setReducedMotion(value) {
      reduced = value;
      controls.enableDamping = !value;
      spin();
    },
    // Face (lat, lon) from `zoom` times closer than the whole-globe framing. Reduced motion cuts instead of gliding.
    setView({ lat, lon, zoom = 1 }, { duration = 1.2 } = {}) {
      const from = camera.position.clone().normalize();
      const to = new Vector3(...toXYZ(lat, lon, 1)).normalize();
      view = { from, fromLength: camera.position.length(), turn: new Quaternion().setFromUnitVectors(from, to), zoom, t: reduced ? 1 : 0, duration: Math.max(duration, 0.01) };
    },
    // Keyboard controls: the same moves as dragging and scrolling
    rotate(dTheta, dPhi) {
      const spherical = new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      spherical.theta += dTheta;
      spherical.phi = clamp(spherical.phi + dPhi, 0.15, Math.PI - 0.15);
      camera.position.setFromSpherical(spherical).add(controls.target);
      camera.lookAt(controls.target);
    },
    zoom(factor) {
      camera.position.setLength(clamp(camera.position.length() * factor, controls.minDistance, controls.maxDistance));
    },
    dispose() {
      abort.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      for (const key of Object.keys(clouds)) removeCloud(key);
      Object.values(sprites).forEach((map) => map.dispose());
      release(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

