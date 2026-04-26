import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../lib/types';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (token: string, refreshToken: string, user: User) => void;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
  setTokens: (token: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      login: (token, refreshToken, user) => set({ 
        token, 
        refreshToken, 
        user, 
        isAuthenticated: true 
      }),
      logout: () => set({ token: null, refreshToken: null, user: null, isAuthenticated: false }),
      setTokens: (token, refreshToken) => set((state) => ({
        token,
        refreshToken,
        user: state.user,
        isAuthenticated: !!state.user,
      })),
      updateUser: (data) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        })),
    }),
    {
      name: 'stayvise-auth',
    }
  )
);
