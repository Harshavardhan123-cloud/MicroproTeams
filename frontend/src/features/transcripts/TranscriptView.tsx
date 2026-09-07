import React, { useState, useMemo } from 'react';
import { Search, User, Clock, MessageSquare } from 'lucide-react';
import { TranscriptSegment } from '../../types/meetingAI';

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  currentTime?: number;
  onSeek?: (seconds: number) => void;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  segments,
  currentTime = 0,
  onSeek
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;
    const q = searchQuery.toLowerCase();
    return segments.filter(
      (s) => s.text.toLowerCase().includes(q) || s.speaker_name.toLowerCase().includes(q)
    );
  }, [segments, searchQuery]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-[#1F1F1F] border border-teams-border rounded-xl overflow-hidden shadow-lg">
      {/* Search Header */}
      <div className="p-3 bg-[#252424] border-b border-teams-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-white text-xs font-bold">
          <MessageSquare className="w-4 h-4 text-teams-purple" />
          <span>Searchable Transcript</span>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-teams-muted" />
          <input
            type="text"
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#181818] border border-teams-border/80 text-white text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-teams-purple"
          />
        </div>
      </div>

      {/* Segments List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
        {filteredSegments.length === 0 ? (
          <div className="text-center text-teams-muted py-8">
            No matching transcript segments found.
          </div>
        ) : (
          filteredSegments.map((seg) => {
            const isActive = currentTime >= seg.start_time && currentTime <= seg.end_time;
            return (
              <div
                key={seg.id}
                onClick={() => onSeek && onSeek(seg.start_time)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-teams-purple/20 border-teams-purple text-white shadow-md'
                    : 'bg-[#292828]/60 border-teams-border/50 text-teams-text hover:border-teams-purple/40 hover:bg-[#292828]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-semibold text-teams-purple">
                    <User className="w-3 h-3 text-teams-purple" />
                    <span>{seg.speaker_name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSeek) onSeek(seg.start_time);
                    }}
                    className="flex items-center gap-1 text-[10px] text-teams-muted hover:text-white bg-[#1A1A1A] px-2 py-0.5 rounded border border-teams-border"
                  >
                    <Clock className="w-2.5 h-2.5" />
                    <span>{formatTime(seg.start_time)}</span>
                  </button>
                </div>

                <p className="leading-relaxed font-normal">{seg.text}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
