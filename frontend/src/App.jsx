// src/App.jsx
import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage    from './components/LoginPage';
import Dashboard    from './components/Dashboard';
import './App.css';

// ─── Auth Context ─────────────────────────────────────────
export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [user, setUser]   = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('accessToken'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = (userData, accessToken, refreshToken) => {
    setUser(userData);
    setToken(accessToken);
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {}
    setUser(null);
    setToken(null);
    localStorage.clear();
  };

  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) throw new Error();
      const { accessToken, refreshToken: newRefresh } = await res.json();
      setToken(accessToken);
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', newRefresh);
      return accessToken;
    } catch {
      logout();
      return false;
    }
  };

  // Fetch with auto-retry on 401
  const apiFetch = async (url, options = {}) => {
    const doFetch = (t) => fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${t}` },
    });

    let res = await doFetch(token);
    if (res.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) res = await doFetch(newToken);
    }
    return res;
  };

  if (loading) return <div className="splash-loader">Loading…</div>;

  return (
    <AuthContext.Provider value={{ user, token, login, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <PrivateRoute><Dashboard /></PrivateRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
