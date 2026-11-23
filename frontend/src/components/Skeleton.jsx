// Placeholder for content that has not arrived. The pulse stops under reduced motion (see base.css).
export function Skeleton({ width = '100%', height = '1em' }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 3, label = 'Loading' }) {
  return (
    <div className="skeleton-rows" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} width={`${90 - i * 12}%`} height="2.25rem" />)}
    </div>
  );
}
