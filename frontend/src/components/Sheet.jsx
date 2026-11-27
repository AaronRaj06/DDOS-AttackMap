import { useEffect, useRef } from 'react';
import Icon from './Icon';

// A bottom sheet on a native <dialog>: focus is trapped, Escape closes it and the page behind is inert, for free.
export default function Sheet({ open, onClose, title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => { if (event.target === ref.current) onClose(); }}
    >
      <div className="sheet-head">
        <h2>{title}</h2>
        <button type="button" className="btn quiet" onClick={onClose}><Icon name="close" />Close</button>
      </div>
      <div className="sheet-body">{open ? children : null}</div>
    </dialog>
  );
}
