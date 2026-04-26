"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";

interface Message {
  role: "ai" | "user";
  text: string;
}

export default function ChatInterface({
  overview,
  analysisResult,
  token,
  className = "",
}: {
  overview: string;
  analysisResult?: Record<string, unknown> | null;
  token?: string | null;
  className?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: overview },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || loading) return;

      setMessages((prev) => [...prev, { role: "user", text }]);
      setInput("");
      setLoading(true);

      // Build conversation history for the API
      const history = messages.map((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.text,
      }));

      try {
        const res = await apiFetch(
          "/agent/chat",
          {
            method: "POST",
            body: JSON.stringify({
              message: text,
              history,
              analysis_context: analysisResult
                ? Object.fromEntries(
                    Object.entries(analysisResult).filter(
                      ([k]) => k !== "combined_fingerprint_b64" && k !== "temporal_fingerprints_b64",
                    ),
                  )
                : null,
            }),
          },
          token ?? null,
        );

        if (!res.ok) {
          throw new Error(`Agent returned ${res.status}`);
        }

        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: data.reply ?? "Sorry, I couldn't respond." },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text: "I'm having trouble connecting right now. Please try again in a moment.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, analysisResult, token],
  );

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {/* Message list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2.5 pb-2 pr-0.5">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`text-xs leading-relaxed rounded-2xl px-3.5 py-2.5 max-w-[88%] ${
                  msg.role === "user"
                    ? "bg-[rgba(249,87,56,0.12)] text-[#f95738] border border-[rgba(249,87,56,0.08)] rounded-br-lg"
                    : "text-[#0d3b66]/65 bg-[rgba(13,59,102,0.03)] border border-[rgba(13,59,102,0.06)] rounded-bl-lg"
                }`}
              >
                {msg.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && (
          <motion.div
            className="flex justify-start"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-lg bg-[rgba(13,59,102,0.03)] border border-[rgba(13,59,102,0.06)]">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[#0d3b66]/30" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[#0d3b66]/30" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[#0d3b66]/30" />
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="relative flex items-center mt-3 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ask Sera about this track…"
          disabled={loading}
          className="w-full bg-[rgba(13,59,102,0.03)] border border-[rgba(13,59,102,0.08)] focus:border-[#f95738]/50 focus:bg-[rgba(249,87,56,0.02)] rounded-full text-[#0d3b66] placeholder-[rgba(13,59,102,0.3)] outline-none text-xs transition-all duration-200 disabled:opacity-50"
          style={{ padding: "10px 44px 10px 16px" }}
        />
        <button
          type="submit"
          disabled={loading}
          className="absolute right-1.5 bg-[#f95738] hover:bg-[#d84b31] transition-all duration-200 w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40 hover:shadow-[0_2px_8px_rgba(249,87,56,0.3)]"
        >
          <Send className="size-3 text-white -translate-x-px translate-y-px" />
        </button>
      </form>
    </div>
  );
}
