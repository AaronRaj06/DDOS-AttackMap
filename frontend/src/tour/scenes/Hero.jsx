import { intro, scenes, steps } from '../content';

// The globe draws itself in behind this. `ready` is real: it turns true when the coastlines have loaded.
export default function Hero({ active, ready }) {
  return (
    <section id="top" className="tour-scene tour-scene-hero" data-active={active === 'top'} aria-labelledby="top-h">
      <div className="tour-caption">
        <h1 id="top-h">{intro.title}</h1>
        <p>{intro.subtitle}</p>
        <div className="tour-actions">
          <a className="btn primary" href="/">{intro.liveMap}</a>
          <a className="btn" href={`#${steps[0].id}`}>{intro.howItWorks} ↓</a>
        </div>
        <p className="tour-loading" role="status">{ready ? '' : scenes.loading}</p>
      </div>
    </section>
  );
}
