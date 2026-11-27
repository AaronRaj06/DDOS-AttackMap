import { useId, useMemo, useRef, useState } from 'react';
import { allCountries } from '../utils/filters';

const MAX_SHOWN = 8;

// The ARIA 1.2 combobox pattern: one input, a listbox, and aria-activedescendant so focus stays in the input.
export default function CountryPicker({ exclude, onPick, onClose }) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef(null);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    const pool = allCountries().filter(({ code }) => !exclude.includes(code));
    if (!q) return pool.slice(0, MAX_SHOWN);
    const starts = pool.filter(({ name, code }) => name.toLowerCase().startsWith(q) || code.toLowerCase() === q);
    const rest = pool.filter((c) => !starts.includes(c) && c.name.toLowerCase().includes(q));
    return [...starts, ...rest].slice(0, MAX_SHOWN);
  }, [text, exclude]);
  const index = Math.min(active, Math.max(matches.length - 1, 0));

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') setActive((index + 1) % Math.max(matches.length, 1));
    else if (event.key === 'ArrowUp') setActive((index - 1 + matches.length) % Math.max(matches.length, 1));
    else if (event.key === 'Enter' && matches[index]) onPick(matches[index].code);
    else if (event.key === 'Escape') onClose();
    else return;
    event.preventDefault();
  }

  return (
    <div className="combobox">
      <label className="sr-only" htmlFor={`${listId}-input`}>Country to watch</label>
      <input
        id={`${listId}-input`}
        ref={inputRef}
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={matches[index] ? `${listId}-${matches[index].code}` : undefined}
        autoComplete="off"
        placeholder="Type a country"
        value={text}
        onChange={(event) => { setText(event.target.value); setActive(0); }}
        onKeyDown={onKeyDown}
        onBlur={(event) => { if (!event.currentTarget.parentElement.contains(event.relatedTarget)) onClose(); }}
      />
      <ul id={listId} role="listbox" aria-label="Matching countries">
        {matches.map(({ code, name }, i) => (
          <li
            key={code}
            id={`${listId}-${code}`}
            role="option"
            aria-selected={i === index}
            onMouseDown={(event) => { event.preventDefault(); onPick(code); }}
          >
            {name} <span className="code">{code}</span>
          </li>
        ))}
        {matches.length === 0 && <li role="option" aria-selected="false" aria-disabled="true" className="none">No country matches</li>}
      </ul>
    </div>
  );
}
