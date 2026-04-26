"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const sb = getSupabase();
    const code = searchParams.get("code");

    if (code) {
      sb.auth.exchangeCodeForSession(code).then(({ error }) => {
        router.replace(error ? "/login" : "/");
      });
      return;
    }

    // For implicit grant (hash fragment) — listen for auth state change
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        subscription.unsubscribe();
        router.replace("/");
      }
    });

    // Also check if session already exists (hash already processed)
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe();
        router.replace("/");
      }
    });

    // Timeout fallback — if nothing happens in 5s, redirect to login
    const timeout = setTimeout(() => {
      subscription.unsubscribe();
      router.replace("/login");
    }, 5000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [router, searchParams]);

  return (
    <div className="h-full flex items-center justify-center bg-[#0a0a12]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-6 h-6 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin" />
        <p className="text-white/50 text-sm">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center bg-[#0a0a12]">
          <div className="w-6 h-6 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
