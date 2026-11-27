import { useEffect, useRef, useState } from 'react';
import { SEVERITY } from '../utils/severity';
import { spikeSentence } from '../utils/labels';

// Announces a change of threat status once, politely, without moving focus. Ticking times are never announced.
export default function LiveStatus({ spikes }) {
  const [message, setMessage] = useState('');
  const last = useRef(null);
  useEffect(() => {
    if (last.current !== null && last.current !== spikes.status) {
      const first = spikes.active[0];
      setMessage(`Threat status ${SEVERITY[spikes.status].label}. ${first ? spikeSentence(first) : ''}`.trim());
    }
    last.current = spikes.status;
  }, [spikes]);
  return <div className="sr-only" role="status" aria-live="polite">{message}</div>;
}
