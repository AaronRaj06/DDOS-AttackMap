import { useEffect, useMemo } from 'react';
import {
  BufferGeometry, CanvasTexture, Group, Line, LineBasicMaterial, LineDashedMaterial, Mesh, MeshBasicMaterial, SphereGeometry,
  Sprite, SpriteMaterial, SRGBColorSpace, Vector3,
} from 'three';
import Legend from '../../components/Legend';
import { arcPoints, toXYZ } from '../../utils/geo';
import { cssColor, layerColor } from '../../utils/layers';
import { scenes } from '../content';
import { POINTS, ROUTES } from '../illustrative';
import { Caption, Scene } from '../parts';

const LIFT = 1.3; // how far the Radar layer rises above the globe
const copy = scenes.separate;

const line = (points, material) => new Line(new BufferGeometry().setFromPoints(points.map((p) => new Vector3(...p))), material);

function crossSprite(color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  Object.assign(g, { strokeStyle: color, lineWidth: 10, lineCap: 'round' });
  g.beginPath();
  g.moveTo(14, 14); g.lineTo(50, 50); g.moveTo(50, 14); g.lineTo(14, 50);
  g.stroke();
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map, transparent: true, depthTest: false }));
  sprite.scale.setScalar(0.1);
  return sprite;
}

// The Radar layer (its own translucent shell and route arcs) and a dashed line that tries to join one
// reported network to a route. The line only appears once the layers are apart, crossed out.
function build(routes, points) {
  const radar = new Group();
  radar.add(new Mesh(new SphereGeometry(1, 36, 18), new MeshBasicMaterial({
    color: cssColor('--data-l3'), wireframe: true, transparent: true, opacity: 0.07, depthWrite: false,
  })));
  const paths = routes.map((r) => ({ r, path: arcPoints([r.src.lat, r.src.lon], [r.dst.lat, r.dst.lon]) })).filter((x) => x.path);
  for (const { r, path } of paths) radar.add(line(path, new LineBasicMaterial({ color: layerColor(r.layer) })));

  const refusal = new Group();
  refusal.visible = false;
  if (paths.length && points.length) {
    const path = paths[0].path;
    const top = new Vector3(...path[Math.floor(path.length / 2)]).multiplyScalar(LIFT);
    // the reported network closest to that route, so the refused line is short and easy to read
    const near = points.reduce((best, p) => {
      const d = new Vector3(...toXYZ(p.lat, p.lon)).dot(top);
      return d > best.d ? { p, d } : best;
    }, { p: points[0], d: -Infinity }).p;
    const bottom = new Vector3(...toXYZ(near.lat, near.lon, 1.006));
    const dashed = line([bottom.toArray(), top.toArray()], new LineDashedMaterial({ color: cssColor('--text-2'), dashSize: 0.025, gapSize: 0.02 }));
    dashed.computeLineDistances();
    const cross = crossSprite(cssColor('--sev-spike'));
    cross.position.copy(bottom).lerp(top, 0.5);
    refusal.add(dashed, cross);
  }
  return { radar, refusal };
}

export default function Separate({ step, active, globe, feed, reduced }) {
  const on = active === step.id;
  const radarLive = feed.events.at(-1)?.source === 'radar' && feed.corridors.length > 0;
  // Memoised: a new array each render would rebuild the layers on every event
  const routes = useMemo(() => (radarLive ? feed.corridors.filter((r) => r.src && r.dst) : ROUTES), [radarLive, feed.corridors]);
  const abuseLive = feed.threats.points.length > 0;
  const points = abuseLive ? feed.threats.points : POINTS;

  useEffect(() => {
    if (!on) return undefined;
    const g = globe.current;
    if (!g) return undefined;
    const { radar, refusal } = build(routes, points);
    const removeRadar = g.add(radar);
    const removeRefusal = g.add(refusal);
    g.setThreats(points);

    // The layers lift apart; reduced motion shows them apart straight away
    let t = reduced ? 1 : 0;
    let last = performance.now();
    let frame = 0;
    const lift = (now) => {
      t = Math.min(1, t + (now - last) / 1500);
      last = now;
      radar.scale.setScalar(1 + (LIFT - 1) * (1 - (1 - t) ** 3));
      refusal.visible = t === 1;
      if (t < 1) frame = requestAnimationFrame(lift);
    };
    frame = requestAnimationFrame(lift);

    return () => {
      cancelAnimationFrame(frame);
      refusal.traverse((child) => child.material?.map?.dispose());
      removeRadar();
      removeRefusal();
      g.setThreats([]);
    };
  }, [on, routes, points, reduced, globe]);

  return (
    <Scene id={step.id} active={active}>
      <Caption id={step.id} heading={step.heading} source={radarLive && abuseLive ? 'live' : 'illustrative'}>
        {step.body.map((text) => <p key={text}>{text}</p>)}
        <ul className="tour-points">
          <li>{copy.outer}</li>
          <li>{copy.inner}</li>
          <li>{copy.refused}</li>
        </ul>
        <Legend hasPoints hasFlagged={false} />
      </Caption>
    </Scene>
  );
}
