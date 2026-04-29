import { createContext, useContext, useState } from 'react';

export const UnitContext = createContext(null);

export function useUnit() {
  return useContext(UnitContext);
}

export function useUnitProvider() {
  const [unit, setUnit] = useState(() => localStorage.getItem('unit') || 'kg');

  function toggle() {
    setUnit(u => {
      const next = u === 'kg' ? 'lbs' : 'kg';
      localStorage.setItem('unit', next);
      return next;
    });
  }

  function display(kg) {
    if (kg == null) return '—';
    if (unit === 'lbs') return `${(kg * 2.2046).toFixed(1)} lbs`;
    return `${kg} kg`;
  }

  function toKg(val) {
    return unit === 'lbs' ? val / 2.2046 : val;
  }

  return { unit, toggle, display, toKg };
}
