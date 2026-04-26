"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { Users, UserPlus, X, Music, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface FriendItem {
  id: string;
  friend_id: string;
  display_name: string;
  created_at: string | null;
}

interface FeedItem {
  friend_id: string;
  friend_display_name: string;
  song_key: string;
  title: string;
  artist: string;
  interaction_type: string;
  created_at: string | null;
}

interface FriendsActivityProps {
  token: string | null;
  onSongClick?: (songKey: string, title: string, artist: string) => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function avatarColor(name: string): string {
  const colors = [
    "#f95738", "#0d3b66", "#ee964b", "#7b2d8e",
    "#2d8e6e", "#d84b31", "#3b66a0", "#964bee",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function FriendsActivity({ token, onSongClick }: FriendsActivityProps) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManage, setShowManage] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const fetchFeed = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/friends/feed", {}, token);
      if (res.ok) {
        const data: FeedItem[] = await res.json();
        setFeed(data);
      }
    } catch {
      // ignore
    }
  }, [token]);

  const fetchFriends = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/friends", {}, token);
      if (res.ok) {
        const data: FriendItem[] = await res.json();
        setFriends(data);
      }
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([fetchFeed(), fetchFriends()]).finally(() => setLoading(false));
  }, [token, fetchFeed, fetchFriends]);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addInput.trim() || !token) return;
    setAddLoading(true);
    setAddError("");

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(addInput.trim());
    const body = isUUID
      ? { friend_id: addInput.trim() }
      : { display_name: addInput.trim() };

    try {
      const res = await apiFetch(
        "/friends/add",
        { method: "POST", body: JSON.stringify(body) },
        token,
      );
      if (res.ok) {
        setAddInput("");
        await Promise.all([fetchFriends(), fetchFeed()]);
      } else {
        const data = await res.json().catch(() => ({ detail: "Failed to add friend" }));
        setAddError(typeof data.detail === "string" ? data.detail : "Failed to add friend");
      }
    } catch {
      setAddError("Network error");
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!token) return;
    try {
      await apiFetch(`/friends/${friendId}`, { method: "DELETE" }, token);
      await Promise.all([fetchFriends(), fetchFeed()]);
    } catch {
      // ignore
    }
  };

  const hasFriends = friends.length > 0;
  const hasFeed = feed.length > 0;

  return (
    <div className="w-full">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#0d3b66]/40" />
          <span
            className="text-[#0d3b66]/60 text-xs font-semibold tracking-wide uppercase"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Friends Activity
          </span>
        </div>
        <motion.button
          className="text-[#0d3b66]/30 hover:text-[#f95738] transition-colors p-1.5 rounded-lg hover:bg-[rgba(249,87,56,0.06)] cursor-pointer"
          onClick={() => setShowManage(!showManage)}
          whileTap={{ scale: 0.92 }}
          title="Manage friends"
        >
          <UserPlus className="w-3.5 h-3.5" />
        </motion.button>
      </div>

      {/* Manage friends panel */}
      <AnimatePresence>
        {showManage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden mb-3"
          >
            <div className="bg-[rgba(13,59,102,0.04)] border border-[rgba(13,59,102,0.08)] rounded-2xl p-3.5">
              <form onSubmit={handleAddFriend} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={addInput}
                  onChange={(e) => { setAddInput(e.target.value); setAddError(""); }}
                  placeholder="Display name or user ID..."
                  className="flex-1 bg-white/60 border border-[rgba(13,59,102,0.1)] rounded-full text-[#0d3b66] placeholder-[#0d3b66]/30 outline-none text-xs transition-all px-3.5 py-2 focus:border-[#f95738]/40"
                />
                <motion.button
                  type="submit"
                  disabled={addLoading || !addInput.trim()}
                  className="bg-[#f95738] text-white text-xs font-medium px-3.5 py-2 rounded-full hover:bg-[#d84b31] transition-colors disabled:opacity-40 cursor-pointer"
                  whileTap={{ scale: 0.95 }}
                >
                  {addLoading ? "..." : "Add"}
                </motion.button>
              </form>
              {addError && (
                <p className="text-[#f95738] text-xs mb-2 px-1">{addError}</p>
              )}

              {/* Friends list */}
              {friends.length > 0 && (
                <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                  {friends.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-white/50 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                          style={{ backgroundColor: avatarColor(f.display_name || f.friend_id) }}
                        >
                          {(f.display_name || "?")[0].toUpperCase()}
                        </div>
                        <span className="text-[#0d3b66]/70 text-xs font-medium truncate max-w-[140px]">
                          {f.display_name || f.friend_id.slice(0, 8)}
                        </span>
                      </div>
                      <motion.button
                        className="text-[#0d3b66]/20 hover:text-[#f95738] transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                        onClick={() => handleRemoveFriend(f.friend_id)}
                        whileTap={{ scale: 0.9 }}
                        title="Remove friend"
                      >
                        <Trash2 className="w-3 h-3" />
                      </motion.button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feed content */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-4 h-4 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasFriends ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-5"
        >
          <div className="w-10 h-10 rounded-2xl bg-[rgba(13,59,102,0.04)] flex items-center justify-center mx-auto mb-2">
            <Users className="w-4.5 h-4.5 text-[#0d3b66]/20" />
          </div>
          <p className="text-[#0d3b66]/35 text-xs font-medium">No friends yet</p>
          <p className="text-[#0d3b66]/20 text-[11px] mt-1">
            Add friends to see what they&apos;re listening to
          </p>
        </motion.div>
      ) : !hasFeed ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-5"
        >
          <p className="text-[#0d3b66]/35 text-xs font-medium">No activity yet</p>
          <p className="text-[#0d3b66]/20 text-[11px] mt-1">
            Songs your friends analyze will show up here
          </p>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
          <AnimatePresence>
            {feed.slice(0, 10).map((item, i) => (
              <motion.button
                key={`${item.friend_id}-${item.song_key}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[rgba(13,59,102,0.03)] hover:bg-[rgba(249,87,56,0.06)] border border-transparent hover:border-[rgba(249,87,56,0.15)] transition-all group cursor-pointer text-left w-full"
                onClick={() => onSongClick?.(item.song_key, item.title, item.artist)}
                whileTap={{ scale: 0.98 }}
              >
                {/* Friend avatar */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ backgroundColor: avatarColor(item.friend_display_name || item.friend_id) }}
                >
                  {(item.friend_display_name || "?")[0].toUpperCase()}
                </div>

                {/* Song info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#0d3b66]/50 text-[10px] font-medium truncate">
                      {item.friend_display_name || item.friend_id.slice(0, 8)}
                    </span>
                    <span className="text-[#0d3b66]/20 text-[9px]">
                      {timeAgo(item.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Music className="w-3 h-3 text-[#f95738]/40 flex-shrink-0" />
                    <span className="text-[#0d3b66] text-xs font-medium truncate group-hover:text-[#f95738] transition-colors">
                      {item.title}
                    </span>
                    <span className="text-[#0d3b66]/30 text-[10px] truncate flex-shrink-0">
                      {item.artist}
                    </span>
                  </div>
                </div>

                {/* Analyze hint */}
                <span className="text-[#f95738]/0 group-hover:text-[#f95738]/50 text-[9px] font-medium transition-colors flex-shrink-0">
                  analyze →
                </span>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
