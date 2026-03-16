import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Pusher from 'pusher-js';
import { useAuth } from './AuthContext';

const PusherContext = createContext();

export const PusherProvider = ({ children }) => {
  const { user, loading } = useAuth();
  const pusherRef = useRef(null);
  const [channel, setChannel] = useState(null);

  useEffect(() => {
    if (loading || !user) return;

    // ✅ Init Pusher
    const pusherClient = new Pusher(import.meta.env.VITE_PUSHER_KEY, {
      cluster: import.meta.env.VITE_PUSHER_CLUSTER,
    });

    const userChannel = pusherClient.subscribe(`user-${user._id}`);
    pusherRef.current = pusherClient;
    setChannel(userChannel);

    return () => {
      userChannel.unbind_all();
      pusherClient.unsubscribe(`user-${user._id}`);
      pusherClient.disconnect();
    };
  }, [user?._id, loading]);

  return (
    <PusherContext.Provider value={{ channel, pusher: pusherRef.current }}>
      {children}
    </PusherContext.Provider>
  );
};

export const usePusher = () => useContext(PusherContext);