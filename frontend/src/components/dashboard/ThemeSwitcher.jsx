import React from 'react';
import { THEMES } from '../../hooks/useTheme';

const LABELS = { light: '☀ Light', dark: '🌙 Dark', night: '🌃 Night Drive' };

const ThemeSwitcher = ({ theme, setTheme }) => (
  <div className="theme-switcher">
    {Object.values(THEMES).map(t => (
      <button
        key={t}
        type="button"
        className={`theme-btn ${theme === t ? 'active' : ''}`}
        onClick={() => setTheme(t)}
      >
        {LABELS[t]}
      </button>
    ))}
  </div>
);

export default ThemeSwitcher;
