import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setAuthToken, clearAuthToken, validateToken } from '../lib/api';

const REMEMBER_ME_DAYS = 15;

interface AuthState {
  token: string | null;
  username: string | null;
  scopes: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  rememberMe: boolean;
  expiresAt: number | null; // unix timestamp

  setToken: (token: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  checkExpiry: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      scopes: [],
      isAuthenticated: false,
      isLoading: false,
      error: null,
      rememberMe: false,
      expiresAt: null,

      setToken: async (token: string, rememberMe = false) => {
        set({ isLoading: true, error: null });
        try {
          setAuthToken(token);
          const response = await validateToken();

          if (response.success) {
            const expiresAt = rememberMe
              ? Date.now() + REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000
              : null; // null = session-only (cleared on browser close via sessionStorage)

            set({
              token,
              username: response.data.username,
              scopes: response.data.scopes,
              isAuthenticated: true,
              isLoading: false,
              rememberMe,
              expiresAt,
            });
          } else {
            clearAuthToken();
            set({
              error: response.error || 'Token validation failed',
              isLoading: false,
            });
          }
        } catch (err: any) {
          clearAuthToken();
          set({
            error: err.response?.data?.error || 'Invalid token',
            isLoading: false,
            token: null,
            username: null,
            scopes: [],
            isAuthenticated: false,
          });
        }
      },

      logout: () => {
        clearAuthToken();
        set({
          token: null,
          username: null,
          scopes: [],
          isAuthenticated: false,
          error: null,
          rememberMe: false,
          expiresAt: null,
        });
      },

      clearError: () => set({ error: null }),

      checkExpiry: () => {
        const { expiresAt, rememberMe, token } = get();
        if (!token) return;

        // If not remember me, keep for current session (zustand persist handles this)
        if (!rememberMe) return;

        // If remember me but expired, auto-logout
        if (expiresAt && Date.now() > expiresAt) {
          get().logout();
        }
      },
    }),
    {
      name: 'resolveai-auth',
      partialize: (state) => ({
        token: state.token,
        username: state.username,
        scopes: state.scopes,
        isAuthenticated: state.isAuthenticated,
        rememberMe: state.rememberMe,
        expiresAt: state.expiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.token) {
          setAuthToken(state.token);
        }
      },
    }
  )
);
