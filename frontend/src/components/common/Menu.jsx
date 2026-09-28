import { useEffect, useRef, useState } from 'react';

// Small dropdown menu anchored to its trigger button.
export default function Menu({ trigger, items, align = 'right', label = 'More options' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={`icon-btn${open ? ' is-active' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`menu-popover menu-${align}`} role="menu">
          {items.filter(Boolean).map(({ icon: Icon, label: itemLabel, onClick, danger }) => (
            <button
              key={itemLabel}
              type="button"
              role="menuitem"
              className={`menu-item${danger ? ' is-danger' : ''}`}
              onClick={() => { setOpen(false); onClick(); }}
            >
              {Icon && <Icon size={18} />}
              <span>{itemLabel}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
