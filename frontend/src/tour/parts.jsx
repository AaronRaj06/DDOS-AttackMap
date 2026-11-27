import { badges } from './content';

// One full-height stretch of scroll. `active` lets CSS replay a scene's small animations on entry.
export function Scene({ id, active, className = '', children }) {
  return (
    <section id={id} className={`tour-scene ${className}`} data-active={active === id} aria-labelledby={`${id}-h`}>
      {children}
    </section>
  );
}

// Where a scene's data came from. Hollow dot for illustrative or invented, filled for live.
export function SourceBadge({ source, detail }) {
  if (!source) return null;
  return (
    <p className="tour-source" data-source={source}>
      <span className="tour-badge-dot" aria-hidden="true" />{badges[source]}{detail ? ` · ${detail}` : ''}
    </p>
  );
}

export function Caption({ id, heading, source, detail, children }) {
  return (
    <div className="tour-caption">
      <SourceBadge source={source} detail={detail} />
      <h2 id={`${id}-h`}>{heading}</h2>
      {children}
    </div>
  );
}
