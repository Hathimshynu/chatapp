import { lazy, Suspense, useRef, useState } from 'react';
import { Camera, CircleFadingPlus, Pencil, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStatus } from '../../context/StatusContext';
import Avatar from '../common/Avatar';
import StatusRing from '../status/StatusRing';
import { formatDayLabel, formatTime } from '../../lib/format';

// Opened on demand; the composer pulls in the emoji picker.
const StatusComposer = lazy(() => import('../status/StatusComposer'));
const StatusViewer = lazy(() => import('../status/StatusViewer'));

const when = (date) => `${formatDayLabel(date)}, ${formatTime(date)}`;

export default function StatusPanel() {
  const { user } = useAuth();
  const { feed, refresh, markViewed, removeMine } = useStatus();
  const [composer, setComposer] = useState(null); // { mode, file }
  const [viewing, setViewing] = useState(null); // { own, groups, startGroup, startIndex }
  const fileRef = useRef(null);

  const mine = feed?.mine || [];
  const updates = feed?.updates || [];
  const recent = updates.filter(u => !u.allViewed);
  const viewed = updates.filter(u => u.allViewed);

  const pickMedia = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/^(image|video)\//.test(file.type) || file.type === 'image/svg+xml') return;
    setComposer({ mode: 'media', file });
  };

  const openUpdates = (list, index) => {
    const u = list[index];
    const firstUnseen = u.statuses.findIndex(s => !s.viewed);
    setViewing({ own: false, groups: list, startGroup: index, startIndex: firstUnseen >= 0 ? firstUnseen : 0 });
  };

  const renderRow = (list) => (u, i) => (
    <button key={u.user._id} type="button" className="conv-item status-row" onClick={() => openUpdates(list, i)}>
      <StatusRing total={u.statuses.length} seen={u.statuses.filter(s => s.viewed).length}>
        <Avatar user={u.user} size={48} />
      </StatusRing>
      <span className="conv-body">
        <span className="conv-name">{u.user.name}</span>
        <span className="call-meta">{when(u.lastAt)}</span>
      </span>
    </button>
  );

  return (
    <div className="panel">
      <header className="panel-header">
        <h1>Status</h1>
        <div className="panel-actions">
          <button type="button" className="icon-btn" title="Text status" aria-label="Create text status" onClick={() => setComposer({ mode: 'text' })}>
            <Pencil size={20} />
          </button>
          <button type="button" className="icon-btn" title="Photo or video status" aria-label="Add photo or video status" onClick={() => fileRef.current?.click()}>
            <Camera size={20} />
          </button>
        </div>
      </header>
      <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={pickMedia} />

      <div className="panel-scroll">
        <div className="conv-item status-row my-status">
          <button type="button" className="status-mine-main" onClick={() => (mine.length
            ? setViewing({ own: true, groups: [{ user, statuses: mine }], startGroup: 0, startIndex: 0 })
            : fileRef.current?.click())}>
            {mine.length ? (
              <StatusRing total={mine.length} seen={mine.length}><Avatar user={user} size={48} /></StatusRing>
            ) : (
              <span className="status-add-avatar"><Avatar user={user} size={52} /><span className="status-add-plus"><Plus size={14} strokeWidth={3} /></span></span>
            )}
            <span className="conv-body">
              <span className="conv-name">My status</span>
              <span className="call-meta">{mine.length ? `${mine.length} ${mine.length === 1 ? 'update' : 'updates'} · ${when(mine.at(-1).createdAt)}` : 'Tap to add a status update'}</span>
            </span>
          </button>
          <button type="button" className="icon-btn" aria-label="Create text status" onClick={() => setComposer({ mode: 'text' })}><Pencil size={18} /></button>
        </div>

        {feed === null && <p className="empty-hint">Loading…</p>}
        {recent.length > 0 && <div className="list-section">Recent updates</div>}
        {recent.map(renderRow(recent))}
        {viewed.length > 0 && <div className="list-section">Viewed updates</div>}
        {viewed.map(renderRow(viewed))}

        {feed && !updates.length && (
          <div className="empty-state">
            <div className="empty-icon"><CircleFadingPlus size={28} /></div>
            <h3>No updates yet</h3>
            <p>Status updates from your contacts appear here and disappear after 24 hours.</p>
          </div>
        )}
      </div>

      <Suspense fallback={null}>
      {composer && (
        <StatusComposer mode={composer.mode} file={composer.file} onClose={() => setComposer(null)} onPosted={refresh} />
      )}
      {viewing && (
        <StatusViewer
          groups={viewing.groups}
          startGroup={viewing.startGroup}
          startIndex={viewing.startIndex}
          own={viewing.own}
          onViewed={markViewed}
          onDeleted={(status) => removeMine(status._id)}
          onClose={() => setViewing(null)}
        />
      )}
      </Suspense>
    </div>
  );
}
