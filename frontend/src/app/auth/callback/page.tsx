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

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        subscription.unsubscribe();
        router.replace("/");
      }
    });

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe();
        router.replace("/");
      }
    });

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
    <div className="h-full flex items-center justify-center">
      <div
        className="w-6 h-6 border-2 rounded-full animate-spin"
        style={{ borderColor: "rgba(249,87,56,0.3)", borderTopColor: "#f95738" }}
      />
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="h-full" />}>
      <CallbackHandler />
    </Suspense>
  );
}
