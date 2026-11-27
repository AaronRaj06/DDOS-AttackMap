import { useEffect } from 'react';
import Legend from '../../components/Legend';
import { formatAge } from '../../utils/age';
import { scenes } from '../content';
import { POINTS } from '../illustrative';
import { Caption, Scene } from '../parts';

// Reported networks land on the globe up close, one dot each; then the camera pulls back and they
// blend into the density glow the dashboard uses.
export default function Abuse({ step, active, globe, feed }) {
  const on = active === step.id;
  const real = feed.threats.points.length > 0;
  const points = real ? feed.threats.points : POINTS;

  // The camera move runs once per visit; new data from the server only swaps the dots
  useEffect(() => {
    if (!on) return undefined;
    const g = globe.current;
    g?.setView({ lat: 45, lon: -30, zoom: 2.2 });
    const later = setTimeout(() => g?.setView({ lat: 35, lon: -20, zoom: 0.95 }, { duration: 2.5 }), 1800);
    return () => {
      clearTimeout(later);
      g?.setThreats([]);
    };
  }, [on, globe]);

  useEffect(() => {
    if (on) globe.current?.setThreats(points);
  }, [on, points, globe]);

  const updated = real && feed.status?.abuse?.updatedAt ? `AbuseIPDB updated ${formatAge(feed.status.abuse.updatedAt)}` : null;

  return (
    <Scene id={step.id} active={active}>
      <Caption id={step.id} heading={step.heading} source={real ? 'live' : 'illustrative'} detail={updated}>
        <p>{step.body[0]}</p>
        <p>{scenes.abuseCount(points.length)}</p>
        <ul className="tour-points">{step.points.map((text) => <li key={text}>{text}</li>)}</ul>
        <Legend hasPoints hasFlagged={false} />
      </Caption>
    </Scene>
  );
}
