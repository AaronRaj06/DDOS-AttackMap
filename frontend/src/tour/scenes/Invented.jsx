import { useEffect } from 'react';
import { inventedEvent } from '../illustrative';
import { Caption, Scene } from '../parts';

// Random arcs from anywhere to anywhere, the way most attack maps look. They exist only while this
// scene is on screen, and its caption, stamped "invented", is on screen with them.
export default function Invented({ step, active, globe, reduced }) {
  const on = active === step.id;

  useEffect(() => {
    if (!on) return undefined;
    const g = globe.current;
    let n = 0;
    const timer = setInterval(() => g?.addArc(inventedEvent(`invented-${n++}`)), reduced ? 700 : 180);
    return () => {
      clearInterval(timer);
      g?.clearArcs();
    };
  }, [on, reduced, globe]);

  return (
    <Scene id={step.id} active={active}>
      <Caption id={step.id} heading={step.heading} source="invented">
        {step.body.map((text) => <p key={text}>{text}</p>)}
      </Caption>
    </Scene>
  );
}
