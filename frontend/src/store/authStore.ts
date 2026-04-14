import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/api';

interface AuthState {
  session: any | null;
  role: 'coach' | 'athlete' | null;
  profile: any | null;
  _hasHydrated: boolean;
  setAuth: (session: any, role: 'coach' | 'athlete', profile: any) => void;
  clearAuth: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      role: null,
      profile: null,
      _hasHydrated: false,
      setAuth: (session, role, profile) => set({ session, role, profile }),
      clearAuth: () => set({ session: null, role: null, profile: null }),
      logout: async () => {
        try { await apiFetch('/api/athlete/chat', { method: 'DELETE' }); } catch {}
        await supabase.auth.signOut();
        set({ session: null, role: null, profile: null });
      },
    }),
    {
      name: 'laktic-auth',
      // Only persist auth data — not the hydration flag itself
      partialize: (state) => ({
        session: state.session,
        role: state.role,
        profile: state.profile,
      }),
      onRehydrateStorage: () => () => {
        // Fires after localStorage data is loaded into the store
        useAuthStore.setState({ _hasHydrated: true });
      },
    }
  )
);
