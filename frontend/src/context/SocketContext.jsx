import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const { user, loading } = useAuth();

  useEffect(() => {
    // ✅ Don't connect until auth is done loading
    if (loading) return;

    if (!user) {
      if (socket) {
        socket.close();
        setSocket(null);
        setOnlineUsers([]);
      }
      return;
    }

    // ✅ Create socket only when user is confirmed
    const newSocket = io('http://localhost:5000', {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      newSocket.emit('userOnline', user._id);
    });

    newSocket.on('reconnect', () => {
      newSocket.emit('userOnline', user._id);
    });

    newSocket.on('onlineUsers', (users) => {
      setOnlineUsers(users);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
      setSocket(null);
    };
  }, [user?._id, loading]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);