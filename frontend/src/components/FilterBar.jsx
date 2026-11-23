import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { countryName, DEFAULT_FILTERS, hasActiveFilters, MAX_WATCHED } from '../utils/filters';
import Icon from './Icon';

const CountryPicker = lazy(() => import('./CountryPicker'));
const LAYERS = [['all', 'All'], ['l3', 'Network'], ['l7', 'Application']];

export default function FilterBar({ filters, onChange }) {
  const [adding, setAdding] = useState(false);
  const addRef = useRef(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!adding && refocus.current) {
      refocus.current = false;
      addRef.current?.focus();
    }
  }, [adding]);

  const close = () => { refocus.current = true; setAdding(false); };
  const set = (patch) => onChange({ ...filters, ...patch });

  return (
    <div className="filterbar" role="group" aria-label="Filters">
      <div className="segmented" role="group" aria-label="Attack layer">
        {LAYERS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filters.layer === value} onClick={() => set({ layer: value })}>{label}</button>
        ))}
      </div>
      <button type="button" className="btn toggle" aria-pressed={filters.flagged} onClick={() => set({ flagged: !filters.flagged })}>
        <Icon name="flag" />Flagged only
      </button>

      {filters.countries.length > 0 && (
        <ul className="watchlist" aria-label="Watched countries">
          {filters.countries.map((code) => (
            <li key={code}>
              <span>{countryName(code)}</span>
              <button type="button" aria-label={`Stop watching ${countryName(code)}`} onClick={() => set({ countries: filters.countries.filter((c) => c !== code) })}>
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <Suspense fallback={<span className="btn" role="status">Loading</span>}>
          <CountryPicker exclude={filters.countries} onClose={close} onPick={(code) => { set({ countries: [...filters.countries, code] }); close(); }} />
        </Suspense>
      ) : (
        <button type="button" ref={addRef} className="btn" disabled={filters.countries.length >= MAX_WATCHED} onClick={() => setAdding(true)}>
          <Icon name="plus" />Watch a country
        </button>
      )}

      {hasActiveFilters(filters) && (
        <button type="button" className="btn quiet" onClick={() => onChange({ ...DEFAULT_FILTERS })}>Clear filters</button>
      )}
    </div>
  );
}
