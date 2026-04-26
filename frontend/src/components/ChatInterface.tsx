"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Message {
  role: "ai" | "user";
  text: string;
}

export default function ChatInterface({
  overview,
  analysisResult,
  className = "",
}: {
  overview: string;
  analysisResult?: Record<string, unknown> | null;
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
        const res = await apiFetch("/agent/chat", {
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
        });

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
    [input, loading, messages, analysisResult],
  );

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {/* Message list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pb-2 pr-0.5">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <p
              className={`text-xs leading-relaxed rounded-2xl px-3 py-2 max-w-[90%] ${
                msg.role === "user"
                  ? "bg-[rgba(249,87,56,0.1)] text-[#f95738]"
                  : "text-[#0d3b66]/70"
              }`}
            >
              {msg.text}
            </p>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <p className="text-xs leading-relaxed text-[#0d3b66]/40 italic px-3 py-2">
              Sera is thinking...
            </p>
          </div>
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
          className="w-full bg-[rgba(249,87,56,0.06)] border border-[rgba(249,87,56,0.18)] focus:border-[#f95738] rounded-full text-[#f95738] placeholder-[rgba(249,87,56,0.3)] outline-none text-xs transition-colors disabled:opacity-50"
          style={{ padding: "9px 44px 9px 14px" }}
        />
        <button
          type="submit"
          disabled={loading}
          className="absolute right-1.5 bg-[#f95738] hover:bg-[#d84b31] transition-colors w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-50"
        >
          <Send className="size-3 text-white -translate-x-px translate-y-px" />
        </button>
      </form>
    </div>
  );
}
