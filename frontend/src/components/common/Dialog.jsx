import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Centered card on desktop, bottom sheet on phones.
export default function Dialog({ title, onClose, children, footer, className = '', wide = false }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className={`dialog${wide ? ' dialog-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <span className="sheet-handle" aria-hidden="true" />
        {title && (
          <header className="dialog-header">
            <h2>{title}</h2>
            {onClose && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
                <X size={20} />
              </button>
            )}
          </header>
        )}
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}
