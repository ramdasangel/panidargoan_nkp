import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken } from "../api/client";

export type Role = "admin" | "project_manager" | "field_user" | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthMethods {
  authMode: "dummy" | "google" | "both";
  googleClientId: string | null;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  methods: AuthMethods | null;
  loginDummy: (email: string) => Promise<void>;
  loginGoogle: (credential: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [methods, setMethods] = useState<AuthMethods | null>(null);

  useEffect(() => {
    // Fetch enabled auth methods (public — no token needed).
    api<AuthMethods>("/api/auth/methods")
      .then(setMethods)
      .catch(() => setMethods({ authMode: "dummy", googleClientId: null }));

    const token = localStorage.getItem("pdg.token");
    if (!token) { setLoading(false); return; }
    api<User>("/api/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function loginDummy(email: string) {
    const result = await api<{ token: string; user: User }>("/api/auth/dummy", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setToken(result.token);
    setUser(result.user);
  }

  async function loginGoogle(credential: string) {
    const result = await api<{ token: string; user: User }>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    setToken(result.token);
    setUser(result.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, methods, loginDummy, loginGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
