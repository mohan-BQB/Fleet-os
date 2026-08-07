import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as auth from '../api/auth';
import { ApiError } from '../api/client';
import type { CurrentUser, PermissionAction, PermissionSection } from '../api/types';

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Re-fetches /me - used after impersonate/stop-impersonation, which swap
  // the session's identity server-side without a normal login() call.
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auth
      .me()
      .then(setUser)
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error('Failed to check session', err);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleLogin(username: string, password: string) {
    const loggedInUser = await auth.login(username, password);
    setUser(loggedInUser);
  }

  async function handleLogout() {
    await auth.logout();
    setUser(null);
  }

  async function refreshUser() {
    setUser(await auth.me());
  }

  return (
    <AuthContext.Provider value={{ user, loading, login: handleLogin, logout: handleLogout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

// Gate nav items and buttons off the resolved grid /auth/me/ hands back -
// no separate permissions round-trip. Defaults to 'view' since that's what
// most read-path checks want; write paths pass 'add_edit'/'change_status'.
export function usePermission(section: PermissionSection, action: PermissionAction = 'view') {
  const { user } = useAuth();
  return user?.permissions?.[section]?.[action] ?? false;
}
