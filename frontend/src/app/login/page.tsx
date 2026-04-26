"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { SeratoneLogo } from "@/components/Icons";

export default function LoginPage() {
  const { user, loading, signInWithGoogle, signInWithSpotify } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#fffdf5]">
        <div className="w-6 h-6 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center bg-[#fffdf5] px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md flex flex-col items-center"
      >
        {/* Logo */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex">
            <div className="bg-[#f4d35e] h-8 w-[4px]" />
            <div className="bg-[#ee964b] h-8 w-[4px]" />
            <div className="bg-[#f95738] h-8 w-[4px]" />
          </div>
          <SeratoneLogo className="h-[50px] w-auto" />
        </div>

        <p className="text-[#0d3b66]/50 text-sm tracking-tight mb-12">
          Music discovery through predicted brain response
        </p>

        {/* Auth Buttons */}
        <div className="w-full space-y-4">
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-[#0d3b66]/10 hover:border-[#0d3b66]/25 rounded-full py-3.5 px-6 text-[#0d3b66] font-medium text-base transition-all cursor-pointer hover:shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          <button
            onClick={signInWithSpotify}
            className="w-full flex items-center justify-center gap-3 bg-[#1DB954] hover:bg-[#1aa34a] rounded-full py-3.5 px-6 text-white font-medium text-base transition-all cursor-pointer hover:shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Continue with Spotify
          </button>
        </div>

        <p className="mt-8 text-[#0d3b66]/30 text-xs text-center">
          By continuing, you agree to let Seratone analyze your music taste
          through predicted cortical responses.
        </p>
      </motion.div>
    </div>
  );
}
