"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const sb = getSupabase();

    const code = searchParams.get("code");
    if (code) {
      sb.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          console.error("Code exchange failed:", error.message);
          router.replace("/login");
        } else {
          router.replace("/");
        }
      });
    } else {
      sb.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.replace("/");
        } else {
          router.replace("/login");
        }
      });
    }
  }, [router, searchParams]);

  return (
    <div className="h-full flex items-center justify-center bg-[#fffdf5]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-6 h-6 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin" />
        <p className="text-[#0d3b66]/50 text-sm">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center bg-[#fffdf5]">
          <div className="w-6 h-6 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
