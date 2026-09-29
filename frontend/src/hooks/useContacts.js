import { useMemo } from 'react';
import { useChat } from '../context/ChatContext';

// People you have a direct chat with — the app's notion of "contacts"
// (the server uses the same definition for status privacy).
export default function useContacts() {
  const { conversations, otherParticipant } = useChat();
  return useMemo(() => conversations
    .filter(c => !c.isGroup)
    .map(c => otherParticipant(c))
    .filter(Boolean), [conversations, otherParticipant]);
}
