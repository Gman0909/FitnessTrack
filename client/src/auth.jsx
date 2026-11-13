import { createContext, useContext, useState, useEffect } from 'react';
import { api, outbox } from './api/index.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    api.getMe().then(setUser).catch(() => setUser(null));
  }, []);

  // Deliver any sets queued while signed out / offline once a user is back.
  useEffect(() => { if (user) outbox.flush(); }, [user?.id]); // eslint-disable-line

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
