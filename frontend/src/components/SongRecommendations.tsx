"use client";

interface Song {
  title: string;
  artist: string;
  tag?: string;
}

const FALLBACK_SONGS: Song[] = [
  { title: "Motion Picture Soundtrack", artist: "Radiohead",           tag: "ambient"  },
  { title: "Holocene",                   artist: "Bon Iver",            tag: "folk"     },
  { title: "Skinny Love",                artist: "Bon Iver",            tag: "indie"    },
  { title: "The Night Will Always Win",  artist: "Manchester Orchestra",tag: "rock"     },
  { title: "Heartbeats",                 artist: "José González",       tag: "acoustic" },
  { title: "Bloodbank",                  artist: "Bon Iver",            tag: "ambient"  },
];

interface SongRecommendationsProps {
  className?: string;
  songs?: Song[];
  loading?: boolean;
  onSongClick?: (song: Song) => void;
}

export default function SongRecommendations({
  className = "",
  songs,
  loading = false,
  onSongClick,
}: SongRecommendationsProps) {
  const displaySongs = songs && songs.length > 0 ? songs : FALLBACK_SONGS;

  return (
    <div className={`flex flex-col ${className}`}>
      <p className="text-[#0d3b66]/35 text-[9px] tracking-[0.12em] uppercase font-semibold mb-3">
        {songs && songs.length > 0 ? "similar tracks" : "listen next"}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-4 h-4 border-2 border-[#f95738]/40 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {displaySongs.map((song, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-[rgba(13,59,102,0.04)] transition-colors cursor-pointer group"
              onClick={() => onSongClick?.(song)}
            >
              <span className="text-[#0d3b66]/25 text-[10px] tabular-nums w-3 shrink-0 text-right">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[#0d3b66] text-[11px] font-medium truncate leading-tight">
                  {song.title}
                </p>
                <p className="text-[#0d3b66]/45 text-[10px] truncate leading-tight mt-0.5">
                  {song.artist}
                </p>
              </div>
              {song.tag && (
                <span className="text-[#f95738]/40 text-[8px] uppercase tracking-wider shrink-0 group-hover:text-[#f95738]/70 transition-colors">
                  {song.tag}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
