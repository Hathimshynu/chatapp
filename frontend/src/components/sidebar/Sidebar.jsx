import { CircleDashed, MessageCircle, Phone, Settings, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useStatus } from '../../context/StatusContext';
import { useFriends } from '../../context/FriendsContext';
import Avatar from '../common/Avatar';
import ChatList from './ChatList';
import CallsPanel from './CallsPanel';
import StatusPanel from './StatusPanel';
import SettingsPanel from './SettingsPanel';
import FriendsPanel from './FriendsPanel';

const TABS = [
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'status', label: 'Status', icon: CircleDashed },
  { id: 'friends', label: 'Friends', icon: Users },
  { id: 'calls', label: 'Calls', icon: Phone },
  { id: 'settings', label: 'Settings', icon: Settings }
];

export default function Sidebar({ view, onViewChange, activeConversationId, onOpenConversation, onOpenUser }) {
  const { user } = useAuth();
  const { totalUnread } = useChat();
  const { unseenCount } = useStatus();
  const { incoming } = useFriends();

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
              {id === 'status' && unseenCount > 0 && <span className="nav-dot" aria-label={`${unseenCount} new status updates`} />}
              {id === 'friends' && incoming.length > 0 && (
                <span className="badge nav-badge" aria-label={`${incoming.length} friend requests`}>{incoming.length}</span>
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
        {view === 'status' && <StatusPanel />}
        {view === 'friends' && <FriendsPanel onOpenUser={onOpenUser} />}
        {view === 'calls' && <CallsPanel onOpenConversation={onOpenConversation} onOpenUser={onOpenUser} />}
        {view === 'settings' && <SettingsPanel />}
      </section>
    </aside>
  );
}
