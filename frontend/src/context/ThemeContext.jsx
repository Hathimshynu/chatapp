import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const KEY = 'chatTheme';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

const readPreference = () => {
  try {
    return localStorage.getItem(KEY) || 'system';
  } catch {
    return 'system';
  }
};

const resolve = (preference) =>
  preference === 'dark' || (preference === 'system' && media?.matches) ? 'dark' : 'light';

const apply = (resolved) => {
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#0b1020' : '#ffffff');
};

const ThemeContext = createContext({ preference: 'system', theme: 'light', setPreference: () => {} });

// preference: 'system' | 'light' | 'dark'; theme: the resolved 'light' | 'dark'.
export const ThemeProvider = ({ children }) => {
  const [preference, setPreferenceState] = useState(readPreference);
  const [theme, setTheme] = useState(() => resolve(readPreference()));

  useEffect(() => {
    const update = () => {
      const resolved = resolve(preference);
      setTheme(resolved);
      apply(resolved);
    };
    update();
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, [preference]);

  const setPreference = useCallback((value) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // storage unavailable — keep the choice for this session only
    }
    setPreferenceState(value);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
