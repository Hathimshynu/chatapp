import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import ChatBox from '../components/ChatBox';

export default function Home() {
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [showChat, setShowChat] = useState(false);

  const handleSelectConversation = (conv) => {
    setSelectedConversation(conv);
    setShowChat(true);
  };

  const handleBack = () => {
    setShowChat(false);
    setSelectedConversation(null);
  };

  return (
    <div style={{
      display: 'flex', height: '100vh',
      width: '100vw', overflow: 'hidden',
      background: '#f0f2f5'
    }}>
      <style>{`
        @media (min-width: 768px) {
          .sidebar-col { display: flex !important; }
          .chat-col { display: flex !important; }
        }
      `}</style>

      {/* Sidebar */}
      <div
        className="sidebar-col"
        style={{
          width: '380px', minWidth: '300px',
          flexShrink: 0, height: '100vh',
          display: showChat ? 'none' : 'flex',
          flexDirection: 'column'
        }}
      >
        <Sidebar
          selectedConversation={selectedConversation}
          onSelectConversation={handleSelectConversation}
        />
      </div>

      {/* ChatBox */}
      <div
        className="chat-col"
        style={{
          flex: 1, minWidth: 0,
          display: showChat ? 'flex' : 'none',
          flexDirection: 'column'
        }}
      >
        <ChatBox
          conversation={selectedConversation}
          onBack={handleBack}
        />
      </div>
    </div>
  );
}