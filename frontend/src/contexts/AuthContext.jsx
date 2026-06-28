import { createContext, useContext, useReducer, useEffect } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

const initialState = {
  user: null,
  token: null,
  loading: true,
};

function authReducer(state, action) {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return { ...state, user: action.payload.user, token: action.payload.token, loading: false };
    case 'LOGOUT':
      return { ...state, user: null, token: null, loading: false };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    const token = localStorage.getItem('packer_token');
    const cached = localStorage.getItem('packer_user');
    if (token && cached) {
      try {
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user: JSON.parse(cached), token } });
        // Refresh user data from server (includes latest permissions)
        api.get('/me').then(r => {
          const freshUser = r.data.user;
          localStorage.setItem('packer_user', JSON.stringify(freshUser));
          dispatch({ type: 'LOGIN_SUCCESS', payload: { user: freshUser, token } });
        }).catch(() => {});
      } catch {
        localStorage.removeItem('packer_token');
        localStorage.removeItem('packer_user');
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } else {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/login', { username, password });
    const { user, token } = res.data;
    localStorage.setItem('packer_token', token);
    localStorage.setItem('packer_user', JSON.stringify(user));
    dispatch({ type: 'LOGIN_SUCCESS', payload: { user, token } });
    return res.data;
  };

  const logout = async () => {
    try {
      await api.post('/logout', {}, {
        headers: { Authorization: `Bearer ${state.token}` },
      });
    } catch {}
    localStorage.removeItem('packer_token');
    localStorage.removeItem('packer_user');
    dispatch({ type: 'LOGOUT' });
  };

  const hasPermission = (perm) => {
    if (!state.user?.permissions) return false;
    if (state.user.permissions.includes('*')) return true; // admin wildcard
    return state.user.permissions.includes(perm);
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
