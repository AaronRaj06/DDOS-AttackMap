import { useEffect, useRef, useState } from 'react';
import { arc2d, landPath, projectXY } from '../utils/geo';
import { matchesEvent } from '../utils/filters';

const SHOWN_ARCS = 12;
const HIT_UNITS = 3;

function nearest(points, x, y) {
  let best = null;
  let bestDistance = HIT_UNITS;
  for (const point of points) {
    const [px, py] = projectXY(point.lat, point.lon);
    const distance = Math.hypot(px - x, py - y);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

// The same data as the globe on a flat equirectangular map, with the same colours and shapes.
// Everything pointer-driven here is also reachable from the lists beside it.
export default function MapView({ events, threats, filters, highlight, onHover, onSelect, onTogglePause }) {
  const [land, setLand] = useState('');
  const svgRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/geojson/ne_110m_land.json', { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setLand(landPath(data)))
      .catch((error) => { if (error.name !== 'AbortError') console.error('Could not load the world map', error); });
    return () => controller.abort();
  }, []);

  const arcs = events.filter((event) => matchesEvent(filters, event)).slice(-SHOWN_ARCS);

  function itemAt(event) {
    const id = event.target.dataset?.arc;
    if (id) return { kind: 'arc', event: arcs.find((e) => e.id === id) };
    const svg = svgRef.current;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const { x, y } = point.matrixTransform(svg.getScreenCTM().inverse());
    const hit = nearest(threats.filter((p) => p.flagged), x, y) ?? nearest(threats, x, y);
    return hit ? { kind: 'network', point: hit } : null;
  }

  const hl = highlight?.route;
  const mark = (lat, lon, r) => { const [x, y] = projectXY(lat, lon); return <circle cx={x} cy={y} r={r} className="map-highlight" />; };

  return (
    <div
      className="map-container"
      tabIndex={0}
      role="group"
      aria-label="Flat map of attack routes. Space pauses. The same data is listed in the panels."
      onKeyDown={(event) => { if (event.key === ' ') { event.preventDefault(); onTogglePause(); } }}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 360 180"
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={(event) => { if (event.pointerType !== 'touch') onHover(itemAt(event), event.clientX, event.clientY); }}
        onPointerLeave={() => onHover(null)}
        onClick={(event) => onSelect(itemAt(event))}
      >
        <path className="map-land" d={land} />
        <g className="map-points">
          {threats.map((point, i) => {
            const [x, y] = projectXY(point.lat, point.lon);
            return point.flagged
              ? <circle key={i} cx={x} cy={y} r="1.7" className="dot-flagged" />
              : <circle key={i} cx={x} cy={y} r="0.9" className="dot-reported" />;
          })}
        </g>
        <g className="map-arcs">
          {arcs.map((event) => (
            <g key={event.id} className={`map-arc layer-${event.layer}`}>
              <path d={arc2d([event.src_lat, event.src_lon], [event.dst_lat, event.dst_lon])} className="arc-line" pathLength="1" />
              <path d={arc2d([event.src_lat, event.src_lon], [event.dst_lat, event.dst_lon])} className="arc-hit" data-arc={event.id} />
              <circle cx={projectXY(event.dst_lat, event.dst_lon)[0]} cy={projectXY(event.dst_lat, event.dst_lon)[1]} r="1.6" className="arc-end" />
            </g>
          ))}
        </g>
        {hl && <path d={arc2d([hl.src.lat, hl.src.lon], [hl.dst.lat, hl.dst.lon])} className="map-highlight-arc" />}
        {hl && mark(hl.src.lat, hl.src.lon, 2.6)}
        {hl && mark(hl.dst.lat, hl.dst.lon, 2.6)}
        {highlight?.point && mark(highlight.point.lat, highlight.point.lon, 3)}
      </svg>
    </div>
  );
}
