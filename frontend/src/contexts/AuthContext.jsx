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
    const user = localStorage.getItem('packer_user');
    if (token && user) {
      try {
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user: JSON.parse(user), token } });
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

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
