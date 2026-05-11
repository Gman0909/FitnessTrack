import { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api/index.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    api.getMe().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    function handleExpired() { setUser(null); }
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
