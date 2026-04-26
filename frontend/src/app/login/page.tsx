"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { SeratoneLogo, SpotifyIcon } from "@/components/Icons";
import { apiFetch } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { UserRound } from "lucide-react";
import { useAppBackground } from "../providers";

const TEMP_EMAIL = "dwelicki@uw.edu";
const TEMP_PASSWORD = "seratone-demo-2026";
const TEMP_DISPLAY = "Demo User";

const ease = [0.16, 1, 0.3, 1] as const;

export default function LoginPage() {
  const { user, loading, signInWithSpotify } = useAuth();
  const { setColorMode } = useAppBackground();
  const router = useRouter();
  const [tempLoading, setTempLoading] = useState(false);
  const [tempError, setTempError] = useState("");
  const redirectStartedRef = useRef(false);
  const shouldExit = !loading && !!user;

  // Login page always shows orange
  useEffect(() => {
    setColorMode("orange");
  }, [setColorMode]);

  useEffect(() => {
    if (!shouldExit || redirectStartedRef.current) return;
    redirectStartedRef.current = true;
    setColorMode("blue");
    const timeout = setTimeout(() => router.replace("/"), 700);
    return () => clearTimeout(timeout);
  }, [shouldExit, router, setColorMode]);

  const handleTempLogin = async () => {
    setTempLoading(true);
    setTempError("");
    try {
      await apiFetch("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: TEMP_EMAIL,
          password: TEMP_PASSWORD,
          display_name: TEMP_DISPLAY,
        }),
      });
      const sb = getSupabase();
      const { error } = await sb.auth.signInWithPassword({
        email: TEMP_EMAIL,
        password: TEMP_PASSWORD,
      });
      if (error) throw error;
    } catch (err) {
      setTempError(err instanceof Error ? err.message : "Login failed");
      setTempLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center">
      {/* Login content — fades in once session check completes, fades out on exit */}
      <motion.div
        className="flex flex-col items-center"
        style={{ width: "min(90vw, 420px)" }}
        initial={{ opacity: 0, y: 16 }}
        animate={{
          opacity: loading || shouldExit ? 0 : 1,
          y: loading ? 16 : 0,
        }}
        transition={{ duration: 0.55, ease, delay: loading ? 0 : 0.05 }}
      >
        {/* Logo + tagline */}
        <div className="flex flex-col items-center mb-16">
          <SeratoneLogo className="h-[41px] w-auto mb-8" />
          <p
            className="text-[15px] tracking-[-0.5px]"
            style={{ color: "rgba(13,59,102,0.6)", fontFamily: "var(--font-body)" }}
          >
            Brain response backed music discovery
          </p>
        </div>

        {/* Buttons */}
        <div className="w-full flex flex-col gap-[14px]">
          <motion.button
            onClick={signInWithSpotify}
            className="w-full flex items-center justify-between rounded-full cursor-pointer"
            style={{
              background: "rgba(29,141,83,0.32)",
              color: "#1d8d53",
              fontFamily: "var(--font-body)",
              paddingTop: 16,
              paddingBottom: 16,
              paddingLeft: 40,
              paddingRight: 40,
            }}
            whileHover={{ background: "rgba(29,141,83,0.46)" }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <span className="font-medium text-[15px] tracking-[-0.3px]">
              continue with spotify
            </span>
            <SpotifyIcon className="w-[22px] h-[22px] shrink-0" />
          </motion.button>

          <motion.button
            onClick={handleTempLogin}
            disabled={tempLoading}
            className="w-full flex items-center justify-between rounded-full cursor-pointer disabled:cursor-default"
            style={{
              background: "rgba(70,94,81,0.32)",
              color: "#465e51",
              fontFamily: "var(--font-body)",
              paddingTop: 16,
              paddingBottom: 16,
              paddingLeft: 40,
              paddingRight: 40,
            }}
            whileHover={!tempLoading ? { background: "rgba(70,94,81,0.46)" } : {}}
            whileTap={!tempLoading ? { scale: 0.98 } : {}}
            transition={{ duration: 0.15 }}
          >
            <span className="font-medium text-[15px] tracking-[-0.3px]">
              {tempLoading ? "signing in…" : "continue as demo user"}
            </span>
            {tempLoading ? (
              <div
                className="w-[18px] h-[18px] border-2 rounded-full animate-spin shrink-0"
                style={{
                  borderColor: "rgba(70,94,81,0.3)",
                  borderTopColor: "#465e51",
                }}
              />
            ) : (
              <UserRound className="w-[22px] h-[22px] shrink-0" strokeWidth={1.75} />
            )}
          </motion.button>

          {tempError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[#f95738] text-xs text-center"
            >
              {tempError}
            </motion.p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
