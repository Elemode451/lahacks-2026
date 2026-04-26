"use client";

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface Message {
  role: "ai" | "user";
  text: string;
}

const MOCK_REPLIES = [
  "The elevated limbic activity suggests this track engages memory circuits strongly — typical of music tied to formative experiences.",
  "The low speechiness combined with high acousticness indicates an introspective, texture-driven composition rather than a lyric-forward one.",
  "Tempo patterns align with a resting heart rate, which may explain the calming yet emotionally intense perception.",
  "The valence score sits in a bittersweet zone — neurologically this activates both reward and mild melancholy pathways simultaneously.",
];

let replyIdx = 0;

export default function ChatInterface({
  overview,
  className = "",
}: {
  overview: string;
  className?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: overview },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    const reply = MOCK_REPLIES[replyIdx % MOCK_REPLIES.length];
    replyIdx++;
    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "ai", text: reply },
    ]);
    setInput("");
  };

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
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="relative flex items-center mt-3 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ask about this track…"
          className="w-full bg-[rgba(249,87,56,0.06)] border border-[rgba(249,87,56,0.18)] focus:border-[#f95738] rounded-full text-[#f95738] placeholder-[rgba(249,87,56,0.3)] outline-none text-xs transition-colors"
          style={{ padding: "9px 44px 9px 14px" }}
        />
        <button
          type="submit"
          className="absolute right-1.5 bg-[#f95738] hover:bg-[#d84b31] transition-colors w-7 h-7 rounded-full flex items-center justify-center"
        >
          <Send className="size-3 text-white -translate-x-px translate-y-px" />
        </button>
      </form>
    </div>
  );
}
