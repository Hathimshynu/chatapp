import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useBackClose } from '../lib/backStack';

const UserProfileSheet = lazy(() => import('../components/friends/UserProfileSheet'));

const ProfileContext = createContext({ openProfile: () => {} });

// Lets any component open someone's profile: openProfile(user).
export const ProfileProvider = ({ onMessage, children }) => {
  const { user: me } = useAuth();
  const [person, setPerson] = useState(null);
  const close = useCallback(() => setPerson(null), []);
  useBackClose(!!person, close);

  const openProfile = useCallback((user) => {
    if (!user?._id || String(user._id) === String(me._id)) return; // your own profile lives in Settings
    setPerson(user);
  }, [me._id]);

  const value = useMemo(() => ({ openProfile }), [openProfile]);
  return (
    <ProfileContext.Provider value={value}>
      {children}
      {person && (
        <Suspense fallback={null}>
          <UserProfileSheet key={person._id} user={person} onClose={close} onMessage={onMessage} />
        </Suspense>
      )}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => useContext(ProfileContext);
