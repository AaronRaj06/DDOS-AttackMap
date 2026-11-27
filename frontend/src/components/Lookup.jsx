import { useState } from 'react';
import { useRemote } from '../hooks/useRemote';
import Icon from './Icon';
import { SkeletonRows } from './Skeleton';

const BASIS = {
  listed_network: 'Uses the report age of this network on the blacklist.',
  neutral_age: 'This network has no report age, so the score reflects network type, country and ASN only.',
};

function Result({ data }) {
  const place = [data.city, data.countryName].filter(Boolean).join(', ');
  const { classifier } = data;
  return (
    <div className="lookup-result">
      <dl className="facts">
      <div><dt>Location (approximate)</dt><dd>{place || 'Unknown'}{place && !data.precise ? ', country level' : ''}</dd></div>
      <div><dt>Network</dt><dd>{data.asn != null ? `AS${data.asn} ${data.org}` : 'Unknown'}</dd></div>
      <div>
        <dt>Blacklist, checked by network</dt>
        <dd>
          <span className="mono">{data.network}</span>
          {data.networkListed ? ' has at least one reported IP' : ' has no reported IPs'}
        </dd>
      </div>
      <div>
        <dt>Classifier</dt>
        <dd>
          {classifier.score == null ? (classifier.state === 'untrained' ? 'Not trained' : 'Not available') : (
            <span className={classifier.flagged ? 'tone-bad' : ''}>
              <Icon name={classifier.flagged ? 'burst' : 'check'} />
              Score {classifier.score.toFixed(2)}, {classifier.flagged ? 'would be flagged' : 'not flagged'}
            </span>
          )}
        </dd>
      </div>
    </dl>
    {classifier.basis && <p className="note">{BASIS[classifier.basis]}</p>}
    </div>
  );
}

// Offline: nothing here spends API quota or leaves the server
export default function Lookup() {
  const [text, setText] = useState('');
  const [query, setQuery] = useState(null);
  const { data, error, loading } = useRemote(query ? `/lookup?ip=${encodeURIComponent(query)}` : null);
  return (
    <>
      <form className="lookup" onSubmit={(event) => { event.preventDefault(); if (text.trim()) setQuery(text.trim()); }}>
        <label htmlFor="lookup-ip">IP address</label>
        <div className="lookup-row">
          <input id="lookup-ip" value={text} maxLength={45} autoComplete="off" spellCheck="false" placeholder="8.8.8.8" onChange={(event) => setText(event.target.value)} />
          <button type="submit" className="btn"><Icon name="search" />Look up</button>
        </div>
      </form>
      <div aria-live="polite">
        {loading && <SkeletonRows rows={3} label="Looking up" />}
        {error && <p className="lookup-error" role="alert">{error}</p>}
        {data && <Result data={data} />}
      </div>
    </>
  );
}
