import { formatAge } from '../utils/age';
import Icon from './Icon';

const STATE = {
  active: ['check', 'Active', 'ok'],
  stale: ['triangle', 'Active, but over 30 days old', 'warn'],
  untrained: ['dash', 'Not trained', 'none'],
  needs_geo_database: ['triangle', 'Needs the ASN database', 'warn'],
};

const two = (value) => (typeof value === 'number' ? value.toFixed(2) : '–');

// What the classifier is, when it was trained and how it scored on IPs it never saw
export default function ModelCard({ classifier, now }) {
  const [icon, label, tone] = STATE[classifier.state] ?? STATE.untrained;
  const { trainedAt, samples, metrics, threshold } = classifier;
  const total = samples ? samples.train + samples.validation + samples.test : 0;
  return (
    <div className="model-card">
      <p className={`state tone-${tone}`}><Icon name={icon} />DoS classifier: {label}</p>
      {trainedAt ? (
        <dl className="facts">
          <div><dt>Trained</dt><dd>{formatAge(trainedAt, now)}, on {total.toLocaleString()} labeled IPs</dd></div>
          <div>
            <dt>Held-out test ({samples.test.toLocaleString()} IPs)</dt>
            <dd>Precision {two(metrics.precision)}, recall {two(metrics.recall)}</dd>
          </div>
          <div>
            <dt>Better than guessing by</dt>
            <dd>Average precision {two(metrics.averagePrecision)} against a {two(metrics.baseline)} base rate</dd>
          </div>
          <div><dt>Flags at a score of</dt><dd>{two(threshold)} or more</dd></div>
        </dl>
      ) : <p className="note">Run <span className="mono">npm run ml:collect</span> for a few days, then <span className="mono">npm run ml:train</span>.</p>}
      {classifier.state === 'stale' && <p className="note">Retrain monthly: the labels it learned from are getting old.</p>}
      <p className="note">Scores rank networks. They are not probabilities, and a missing report does not prove innocence.</p>
    </div>
  );
}
