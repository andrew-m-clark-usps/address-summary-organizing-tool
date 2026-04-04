const CREDENTIALS = { username: 'admin', password: 'usps2024' };
const SESSION_KEY = 'usps_session';

export const login = (username, password) => {
  if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
    const session = { username, name: 'John D.', loginTime: Date.now() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { success: true, session };
  }
  return { success: false, error: 'Invalid credentials' };
};

export const logout = () => {
  localStorage.removeItem(SESSION_KEY);
};

export const getSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch { return null; }
};

export const isAuthenticated = () => !!getSession();
