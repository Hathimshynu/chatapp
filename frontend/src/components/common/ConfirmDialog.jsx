import Dialog from './Dialog';

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm, onClose }) {
  return (
    <Dialog title={title} onClose={onClose}>
      {message && <p className="dialog-text">{message}</p>}
      <div className="dialog-actions">
        <button type="button" className={`btn btn-block ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={onConfirm}>
          {busy ? 'Please wait…' : confirmLabel}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}
