import {
  BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Group, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, Points, PointsMaterial, Scene,
  SphereGeometry, TubeGeometry, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { arcPoints, landSegments, toXYZ } from './geo.js';
import { LAYERS, POINT_COLORS } from './layers.js';

const MAX_ARCS = 30;
const DRAW_SECONDS = 1.2;
const LIFE_SECONDS = 6;
const FADE_SECONDS = 1.5;

function lines(vertices, color, opacity = 1) {
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3));
  return new LineSegments(geometry, new LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

function graticule() {
  const out = [];
  const step = 4;
  for (let lon = -180; lon < 180; lon += 20) {
    for (let lat = -80; lat < 80; lat += step) out.push(...toXYZ(lat, lon), ...toXYZ(lat + step, lon));
  }
  for (let lat = -80; lat <= 80; lat += 20) {
    for (let lon = -180; lon < 180; lon += step) out.push(...toXYZ(lat, lon), ...toXYZ(lat, lon + step));
  }
  return lines(out, '#8da2c0', 0.12);
}

function starfield(count = 900) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(...new Vector3().randomDirection().multiplyScalar(20 + Math.random() * 20).toArray());
  }
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(out, 3));
  return new Points(geometry, new PointsMaterial({ color: '#7f8ca8', size: 0.07 }));
}

function release(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    child.material?.dispose();
  });
}

export function createGlobe(element, { reducedMotion = false } = {}) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  element.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.fromArray(toXYZ(24, -30, 3.4));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = !reducedMotion;
  controls.rotateSpeed = 0.5;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.6;
  controls.minDistance = 1.8;

  // An opaque core hides whatever is on the far side
  const core = new Mesh(new SphereGeometry(0.992, 64, 48), new MeshBasicMaterial({ color: '#11162a' }));
  scene.add(core, graticule(), starfield());

  const abort = new AbortController();
  fetch('/geojson/ne_110m_land.json', { signal: abort.signal })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => scene.add(lines(landSegments(data, 1.002), '#4fd1a5')))
    .catch((error) => {
      if (error.name !== 'AbortError') console.error('Could not load the world map', error);
    });

  const arcs = [];
  let threatPoints = null;
  let paused = false;
  let elapsed = 0;
  let last = performance.now();

  function removeArc(index) {
    const [arc] = arcs.splice(index, 1);
    scene.remove(arc.group);
    release(arc.group);
  }

  function addArc(event) {
    if (paused || document.hidden) return;
    const color = LAYERS[event.layer]?.color ?? '#ffffff';
    const from = [event.src_lat, event.src_lon];
    const to = [event.dst_lat, event.dst_lon];
    const path = arcPoints(from, to);

    const group = new Group();
    const material = new MeshBasicMaterial({ color, transparent: true });
    let tube = null;
    if (path) {
      const curve = new CatmullRomCurve3(path.map((point) => new Vector3(...point)));
      tube = new Mesh(new TubeGeometry(curve, 64, 0.0045, 5), material);
      const source = new Mesh(new SphereGeometry(0.014, 12, 8), material);
      source.position.fromArray(toXYZ(...from, 1.006));
      group.add(tube, source);
    }
    // Domestic attacks have no path, only a pulse
    const target = new Mesh(new SphereGeometry(0.022, 12, 8), material);
    target.position.fromArray(toXYZ(...to, 1.006));
    group.add(target);

    scene.add(group);
    arcs.push({ group, material, tube, target, born: elapsed });
    if (arcs.length > MAX_ARCS) removeArc(0);
  }

  function setThreats(points) {
    if (threatPoints) {
      scene.remove(threatPoints);
      release(threatPoints);
      threatPoints = null;
    }
    if (!points.length) return;
    const positions = [];
    const colors = [];
    for (const point of points) {
      positions.push(...toXYZ(point.lat, point.lon, 1.005));
      colors.push(...new Color(point.flagged ? POINT_COLORS.flagged : POINT_COLORS.reported).toArray());
    }
    const geometry = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(positions, 3))
      .setAttribute('color', new Float32BufferAttribute(colors, 3));
    threatPoints = new Points(geometry, new PointsMaterial({ size: 0.022, vertexColors: true }));
    scene.add(threatPoints);
  }

  function animateArcs() {
    for (let i = arcs.length - 1; i >= 0; i--) {
      const { tube, target, material, born } = arcs[i];
      const age = elapsed - born;
      if (age >= LIFE_SECONDS) {
        removeArc(i);
        continue;
      }
      const progress = reducedMotion ? 1 : Math.min(age / DRAW_SECONDS, 1);
      if (tube) {
        const total = tube.geometry.index.count;
        tube.geometry.setDrawRange(0, Math.floor((total / 3) * progress) * 3);
      }
      target.visible = !tube || progress === 1;
      if (!reducedMotion) target.scale.setScalar(1 + 0.4 * Math.sin(age * 6));
      material.opacity = Math.min(1, (LIFE_SECONDS - age) / FADE_SECONDS);
    }
  }

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!paused) elapsed += delta;
    animateArcs();
    controls.update(delta);
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
    // Refit on shape changes only, so a user's zoom survives the rest
    if (Math.abs(distance - fitted) > 0.01) {
      camera.position.setLength(distance);
      fitted = distance;
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(element);
  resize();

  return {
    addArc,
    setThreats,
    setPaused(value) {
      paused = value;
      controls.autoRotate = !value && !reducedMotion;
      if (!value || reducedMotion) return;
      // Damping would glide on for five seconds. An undamped update clears it
      const position = camera.position.clone();
      controls.enableDamping = false;
      controls.update();
      camera.position.copy(position);
      camera.lookAt(controls.target);
      controls.enableDamping = true;
    },
    dispose() {
      abort.abort();
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      release(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
