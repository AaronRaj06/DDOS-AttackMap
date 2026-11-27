// The classifier's arithmetic, as GET /threats/{network} reports it. The bars on screen are these numbers,
// so the bars always add up to the score the server gives.
export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export function scoreOf({ bias, factors, other }) {
  return sigmoid(bias + factors.reduce((sum, factor) => sum + factor.contribution, 0) + other);
}

// The five networks to inspect: the three likeliest DoS sources and the two least likely, one per network
export function pickNetworks(points, count = 5) {
  // Highest score first, so a network that appears twice keeps its higher score
  const seen = new Set();
  const byScore = points.filter((p) => p.dosScore != null).sort((a, b) => b.dosScore - a.dosScore)
    .filter((p) => !seen.has(p.network) && seen.add(p.network));
  const flagged = byScore.filter((p) => p.flagged).slice(0, count - 2);
  const rest = byScore.filter((p) => !p.flagged).slice(-(count - flagged.length));
  return [...flagged, ...rest];
}
