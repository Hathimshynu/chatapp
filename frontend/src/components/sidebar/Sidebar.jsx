import { MessageCircle, Phone, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import Avatar from '../common/Avatar';
import ChatList from './ChatList';
import CallsPanel from './CallsPanel';
import SettingsPanel from './SettingsPanel';

const TABS = [
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'calls', label: 'Calls', icon: Phone },
  { id: 'settings', label: 'Settings', icon: Settings }
];

export default function Sidebar({ view, onViewChange, activeConversationId, onOpenConversation, onOpenUser }) {
  const { user } = useAuth();
  const { totalUnread } = useChat();

  return (
    <aside className="sidebar">
      <nav className="nav" aria-label="Main">
        <img className="nav-logo" src="/favicon.png" alt="ChatApp" />
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`nav-btn${view === id ? ' is-active' : ''}`}
            onClick={() => onViewChange(id)}
            aria-current={view === id ? 'page' : undefined}
            title={label}
          >
            <span className="nav-icon">
              <Icon size={22} strokeWidth={view === id ? 2.4 : 2} />
              {id === 'chats' && totalUnread > 0 && (
                <span className="badge nav-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>
              )}
            </span>
            <span className="nav-label">{label}</span>
          </button>
        ))}
        <span className="nav-spacer" />
        <Avatar user={user} size={36} className="nav-avatar" onClick={() => onViewChange('settings')} />
      </nav>

      <section className="sidebar-panel">
        {view === 'chats' && (
          <ChatList
            activeConversationId={activeConversationId}
            onOpenConversation={onOpenConversation}
            onOpenUser={onOpenUser}
          />
        )}
        {view === 'calls' && <CallsPanel onOpenConversation={onOpenConversation} onOpenUser={onOpenUser} />}
        {view === 'settings' && <SettingsPanel />}
      </section>
    </aside>
  );
}
