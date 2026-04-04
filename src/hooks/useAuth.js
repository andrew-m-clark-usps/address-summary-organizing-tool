import { useState, useEffect } from 'react';
import { getSession, login as authLogin, logout as authLogout } from '../services/authService';

export const useAuth = () => {
  const [session, setSession] = useState(getSession);

  const login = (u, p) => {
    const result = authLogin(u, p);
    if (result.success) setSession(result.session);
    return result;
  };

  const logout = () => {
    authLogout();
    setSession(null);
  };

  return { session, isAuthenticated: !!session, login, logout };
};
