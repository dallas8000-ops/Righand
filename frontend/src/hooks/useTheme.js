import { useState, useEffect } from 'react';

const STORAGE_KEY = 'righandTheme';

export const THEMES = {
  light: 'light',
  dark: 'dark',
  night: 'night'
};

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES[saved]) return saved;
    if (localStorage.getItem('nightMode') === 'true') return THEMES.night;
    return THEMES.light;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-night', 'night-drive');
    document.body.classList.add(`theme-${theme}`);
    if (theme === THEMES.night) {
      document.body.classList.add('night-drive');
    }
  }, [theme]);

  const cycleTheme = () => {
    const order = [THEMES.light, THEMES.dark, THEMES.night];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  };

  return { theme, setTheme, cycleTheme, isNight: theme === THEMES.night };
}
