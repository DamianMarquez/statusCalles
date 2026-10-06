import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/authApi.js';
import type { AuthUser, UserProfile } from '../api/authApi.js';

export interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  dialogOpen: boolean;
  openAuthDialog: () => void;
  closeAuthDialog: () => void;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { email: string; displayName: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const anonymousContext: AuthContextValue = {
  user: null,
  profile: null,
  loading: false,
  dialogOpen: false,
  openAuthDialog: () => undefined,
  closeAuthDialog: () => undefined,
  login: async () => undefined,
  register: async () => undefined,
  logout: async () => undefined,
  refreshProfile: async () => undefined,
};
export const AuthContext = createContext<AuthContextValue>(anonymousContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const nextProfile = await authApi.getProfile();
    setProfile(nextProfile);
  }, [user]);

  const loadSession = useCallback(async () => {
    try {
      const sessionUser = await authApi.getSession();
      setUser(sessionUser);
      if (sessionUser) setProfile(await authApi.getProfile());
      else setProfile(null);
    } catch {
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const login = useCallback(async (input: { email: string; password: string }) => {
    const nextUser = await authApi.login(input);
    setUser(nextUser);
    setProfile(await authApi.getProfile());
    setDialogOpen(false);
  }, []);

  const register = useCallback(
    async (input: { email: string; displayName: string; password: string }) => {
      const nextUser = await authApi.register(input);
      setUser(nextUser);
      setProfile(await authApi.getProfile());
      setDialogOpen(false);
    },
    [],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      dialogOpen,
      openAuthDialog: () => setDialogOpen(true),
      closeAuthDialog: () => setDialogOpen(false),
      login,
      register,
      logout,
      refreshProfile,
    }),
    [user, profile, loading, dialogOpen, login, register, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
