import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  session: any | null;
  role: 'coach' | 'athlete' | null;
  profile: any | null;
  setAuth: (session: any, role: 'coach' | 'athlete', profile: any) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      role: null,
      profile: null,
      setAuth: (session, role, profile) => set({ session, role, profile }),
      clearAuth: () => set({ session: null, role: null, profile: null })
    }),
    { name: 'laktic-auth' }
  )
);
