import { useMemo } from 'react';
import { useChat } from '../context/ChatContext';
import { useFriends } from '../context/FriendsContext';

// Your friends plus people you have a direct chat with — the app's notion of
// "contacts" (the server uses the same definition for privacy and status).
export default function useContacts() {
  const { conversations, otherParticipant } = useChat();
  const { friends } = useFriends();
  return useMemo(() => {
    const seen = new Set();
    const people = [];
    const add = (person) => {
      if (!person || seen.has(String(person._id))) return;
      seen.add(String(person._id));
      people.push(person);
    };
    friends.forEach(add);
    conversations.filter(c => !c.isGroup).forEach(c => add(otherParticipant(c)));
    return people;
  }, [friends, conversations, otherParticipant]);
}
