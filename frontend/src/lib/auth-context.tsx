"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { apiFetch } from "./api";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  displayName: string;
  signInWithGoogle: () => Promise<void>;
  signInWithSpotify: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  loading: true,
  displayName: "",
  signInWithGoogle: async () => {},
  signInWithSpotify: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const meta = s.user.user_metadata;
        setDisplayName(
          meta?.full_name ?? meta?.name ?? meta?.display_name ?? s.user.email ?? "",
        );
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const meta = s.user.user_metadata;
        setDisplayName(
          meta?.full_name ?? meta?.name ?? meta?.display_name ?? s.user.email ?? "",
        );
        apiFetch("/auth/sync-profile", { method: "POST" }, s.access_token).catch(
          () => {},
        );
      } else {
        setDisplayName("");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const sb = getSupabase();
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }, []);

  const signInWithSpotify = useCallback(async () => {
    const sb = getSupabase();
    await sb.auth.signInWithOAuth({
      provider: "spotify",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    await sb.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        displayName,
        signInWithGoogle,
        signInWithSpotify,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
