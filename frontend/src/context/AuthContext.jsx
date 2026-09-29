import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { setAuthToken } from '../lib/api';
import { disablePush } from '../lib/push';
import useLatest from '../hooks/useLatest';

// Several signed-in accounts can live on one device (like Instagram/WhatsApp).
// The account list is shared by all tabs (localStorage); the *active* account is
// per tab (sessionStorage), so two tabs can use two different accounts at once.
const ACCOUNTS_KEY = 'chatAccounts';
const ACTIVE_KEY = 'chatActiveId';
const LAST_ACTIVE_KEY = 'chatLastActiveId';
const LEGACY_KEY = 'chatUser';

const isValidAccount = (a) => a && typeof a.token === 'string' && a._id;

const readAccounts = () => {
  try {
    const list = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]').filter(isValidAccount);
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (isValidAccount(legacy) && !list.some(a => a._id === legacy._id)) list.push(legacy);
    localStorage.removeItem(LEGACY_KEY);
    return list;
  } catch {
    return [];
  }
};

const writeAccounts = (list) => {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded (large inline avatars) — retry without them.
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(
        list.map(a => (a.avatar?.startsWith('data:') ? { ...a, avatar: '' } : a))
      ));
    } catch {
      // storage unavailable; accounts stay in memory for this session
    }
  }
};

const readActiveId = (accounts) => {
  let id = null;
  try {
    id = sessionStorage.getItem(ACTIVE_KEY) || localStorage.getItem(LAST_ACTIVE_KEY);
  } catch {
    id = null;
  }
  return accounts.some(a => a._id === id) ? id : accounts[0]?._id || null;
};

const persistActiveId = (id) => {
  try {
    if (id) {
      sessionStorage.setItem(ACTIVE_KEY, id);
      localStorage.setItem(LAST_ACTIVE_KEY, id);
    } else {
      sessionStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // ignore
  }
};

const pickAccountFields = (data) => ({
  _id: data._id,
  name: data.name,
  email: data.email,
  avatar: data.avatar || '',
  status: data.status || '',
  token: data.token
});

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [accounts, setAccounts] = useState(() => {
    const list = readAccounts();
    writeAccounts(list);
    return list;
  });
  const [activeId, setActiveId] = useState(() => {
    const id = readActiveId(accounts);
    // Set the header synchronously so the very first requests are authenticated.
    setAuthToken(accounts.find(a => a._id === id)?.token);
    return id;
  });

  const user = useMemo(() => accounts.find(a => a._id === activeId) || null, [accounts, activeId]);
  const userRef = useLatest(user);

  const commitAccounts = useCallback((updater) => {
    setAccounts(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      writeAccounts(next);
      return next;
    });
  }, []);

  const activate = useCallback((account) => {
    setAuthToken(account?.token);
    persistActiveId(account?._id || null);
    setActiveId(account?._id || null);
  }, []);

  const addSession = useCallback((data) => {
    const account = pickAccountFields(data);
    commitAccounts(prev => [...prev.filter(a => a._id !== account._id), account]);
    activate(account);
    return account;
  }, [commitAccounts, activate]);

  const login = useCallback(async (email, password) => {
    const { data } = await axios.post('/api/auth/login', { email, password }, { headers: { Authorization: undefined } });
    return addSession(data);
  }, [addSession]);

  const register = useCallback(async (name, email, password) => {
    const { data } = await axios.post('/api/auth/register', { name, email, password }, { headers: { Authorization: undefined } });
    return addSession(data);
  }, [addSession]);

  const switchAccount = useCallback((id) => {
    const account = accounts.find(a => a._id === id);
    if (account) activate(account);
  }, [accounts, activate]);

  // Logging out also stops push notifications for that account on this device
  // (skipped when the session already expired — the server would reject it anyway).
  const removeAccount = useCallback((id, { sessionExpired = false } = {}) => {
    const account = accounts.find(a => a._id === id);
    if (account && !sessionExpired) disablePush(account.token).catch(() => {});
    const remaining = accounts.filter(a => a._id !== id);
    commitAccounts(remaining);
    if (id === activeId) activate(remaining[0] || null);
  }, [accounts, activeId, commitAccounts, activate]);

  const logout = useCallback(() => {
    if (activeId) removeAccount(activeId);
  }, [activeId, removeAccount]);

  const logoutAll = useCallback(() => {
    accounts.forEach(a => disablePush(a.token).catch(() => {}));
    commitAccounts([]);
    activate(null);
  }, [accounts, commitAccounts, activate]);

  const updateUser = useCallback((patch) => {
    const id = userRef.current?._id;
    if (!id) return;
    commitAccounts(prev => prev.map(a => (a._id === id ? { ...a, ...patch, token: a.token, _id: a._id } : a)));
  }, [commitAccounts, userRef]);

  // Accounts added/removed in another tab.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== ACCOUNTS_KEY) return;
      const list = readAccounts();
      setAccounts(list);
      if (!list.some(a => a._id === activeId)) activate(list[0] || null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [activeId, activate]);

  // Refresh the profile for the active account; drop it if the session expired.
  useEffect(() => {
    if (!user?.token) return;
    let cancelled = false;
    axios.get('/api/users/me')
      .then(({ data }) => {
        if (!cancelled) updateUser({ name: data.name, email: data.email, avatar: data.avatar || '', status: data.status || '' });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.token, updateUser]);

  // Any 401 for the active account's token means the session is gone. Registered in a layout
  // effect so it is in place before any child component starts a request.
  useLayoutEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        const current = userRef.current;
        const sentAuth = error.config?.headers?.Authorization;
        const isAuthRoute = String(error.config?.url || '').startsWith('/api/auth/');
        if (error.response?.status === 401 && current && !isAuthRoute && sentAuth === `Bearer ${current.token}`) {
          toast.error(`Session expired for ${current.name}. Please sign in again.`);
          removeAccount(current._id, { sessionExpired: true });
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [removeAccount, userRef]);

  const value = useMemo(() => ({
    user,
    accounts,
    loading: false,
    login,
    register,
    logout,
    logoutAll,
    switchAccount,
    removeAccount,
    updateUser
  }), [user, accounts, login, register, logout, logoutAll, switchAccount, removeAccount, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
