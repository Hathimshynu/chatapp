import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

axios.defaults.baseURL = import.meta.env.DEV
  ? ''
  : import.meta.env.VITE_API_URL || '';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = () => {
      try {
        const stored = localStorage.getItem('chatUser');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.token && parsed._id) {
            // ✅ Set axios default immediately
            axios.defaults.headers.common['Authorization'] = `Bearer ${parsed.token}`;
            setUser(parsed);
          } else {
            localStorage.removeItem('chatUser');
          }
        }
      } catch (err) {
        console.error('Auth init error:', err);
        localStorage.removeItem('chatUser');
      } finally {
        // ✅ Always set loading false
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email, password) => {
    const { data } = await axios.post('/api/auth/login', { email, password });
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(data);
    localStorage.setItem('chatUser', JSON.stringify(data));
    return data;
  };

  const register = async (name, email, password) => {
    const { data } = await axios.post('/api/auth/register', { name, email, password });
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(data);
    localStorage.setItem('chatUser', JSON.stringify(data));
    return data;
  };

  const logout = () => {
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    localStorage.removeItem('chatUser');
  };

  return (
    <AuthContext.Provider value={{ user, login,setUser, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);