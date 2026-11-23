import { usePersistentState } from '../hooks/usePersistentState';
import Icon from './Icon';

// A native <details>, so the keyboard, focus and screen reader behaviour come with it. Open state is remembered.
export default function Panel({ id, title, defaultOpen = true, children }) {
  const [state, setState] = usePersistentState('dosmap.panels', {});
  const open = state?.[id] ?? defaultOpen;
  return (
    <details className="panel" open={open} onToggle={(event) => {
        // read it now: React clears currentTarget before a deferred updater would run
        const { open: isOpen } = event.currentTarget;
        setState((s) => ({ ...s, [id]: isOpen }));
      }}>
      <summary>
        <h2>{title}</h2>
        <Icon name="chevron" />
      </summary>
      <div className="panel-body">{children}</div>
    </details>
  );
}
