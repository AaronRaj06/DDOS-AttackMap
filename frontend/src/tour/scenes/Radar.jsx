import { useEffect, useRef } from 'react';
import Legend from '../../components/Legend';
import { formatAge } from '../../utils/age';
import { formatShare, LAYER_LABELS } from '../../utils/labels';
import { scenes } from '../content';
import { ROUTES, routeEvent } from '../illustrative';
import { Caption, Scene } from '../parts';

// The server's weighted replay of Radar routes, drawn as it arrives. Without a connection,
// a built-in replay of example routes stands in, labelled illustrative.
export default function Radar({ step, active, globe, feed }) {
  const streaming = active === 'radar' || active === 'origin';
  const offline = feed.connection === 'reconnecting' && !feed.status;
  const lastDrawn = useRef(null);
  const live = feed.events.at(-1)?.source === 'radar';
  const source = live ? 'live' : 'illustrative';

  // Leaving the scene clears what it drew
  useEffect(() => {
    if (!streaming) return undefined;
    const g = globe.current;
    return () => {
      g?.clearArcs();
      lastDrawn.current = null;
    };
  }, [streaming, globe]);

  useEffect(() => {
    if (!streaming || !feed.events.length) return;
    const index = feed.events.findIndex((event) => event.id === lastDrawn.current);
    // On entry draw a few recent ones, then each new one as it arrives
    const fresh = index === -1 ? feed.events.slice(-4) : feed.events.slice(index + 1);
    for (const event of fresh) globe.current?.addArc(event);
    lastDrawn.current = feed.events.at(-1).id;
  }, [streaming, feed.events, globe]);

  useEffect(() => {
    if (!streaming || !offline) return undefined;
    let n = 0;
    const timer = setInterval(() => globe.current?.addArc(routeEvent(ROUTES, `example-${n++}`)), 900);
    return () => clearInterval(timer);
  }, [streaming, offline, globe]);

  // The top network-layer route: real from Radar when there is a connection, an example otherwise
  const route = feed.corridors.find((r) => r.layer === 'l3' && r.src) ?? ROUTES.find((r) => r.layer === 'l3');
  const routeSource = feed.corridors.length && live ? 'live' : 'illustrative';

  useEffect(() => {
    if (active !== 'origin') return undefined;
    const { lat, lon } = route.src;
    const g = globe.current;
    g?.setView({ lat, lon, zoom: 1.3 });
    g?.setHighlight({ point: { lat, lon } });
    return () => g?.setHighlight(null);
  }, [active, route.src, globe]);

  const updated = live && feed.status?.radar?.updatedAt ? `Radar updated ${formatAge(feed.status.radar.updatedAt)}` : null;

  return (
    <>
      <Scene id={step.id} active={active}>
        <Caption id={step.id} heading={step.heading} source={source} detail={updated}>
          <p className="tour-tick">{scenes.radarTick}</p>
          <p>{step.body[0]}</p>
          <ul className="tour-points">{step.points.map((text) => <li key={text}>{text}</li>)}</ul>
          <Legend hasPoints={false} hasFlagged={false} />
        </Caption>
      </Scene>
      <Scene id="origin" active={active}>
        <Caption id="origin" heading={scenes.origin.heading} source={routeSource}>
          <p className="tour-origin">
            <span className="tour-origin-place">{route.src.name}</span> is <s>{scenes.origin.struck}</s>{' '}
            <strong>{scenes.origin.label}</strong>.
          </p>
          <p>
            {LAYER_LABELS.l3}, top route: {route.src.name} → {route.dst.name}, {formatShare(route.share)} of the traffic Radar reported.
          </p>
          <p>{scenes.origin.reason}</p>
        </Caption>
      </Scene>
    </>
  );
}
