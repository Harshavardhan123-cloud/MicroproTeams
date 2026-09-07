import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, FastForward, RotateCcw } from 'lucide-react';

interface RecordingPlayerProps {
  playbackUrl: string;
  onTimeUpdate?: (currentTime: number) => void;
  seekToTime?: number | null;
  initialDuration?: number;
}

export const RecordingPlayer: React.FC<RecordingPlayerProps> = ({
  playbackUrl,
  onTimeUpdate,
  seekToTime,
  initialDuration
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (initialDuration && initialDuration > 0) {
      setDuration(initialDuration);
    }
  }, [initialDuration]);

  useEffect(() => {
    if (videoRef.current && seekToTime !== undefined && seekToTime !== null) {
      videoRef.current.currentTime = seekToTime;
      setCurrentTime(seekToTime);
    }
  }, [seekToTime]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);
    if (onTimeUpdate) onTimeUpdate(cur);

    // If duration was 0 or unknown, attempt update from video element
    const dur = videoRef.current.duration;
    if (dur && isFinite(dur) && !isNaN(dur) && dur > 0 && duration !== dur) {
      setDuration(dur);
    }
  };

  const handleDurationCheck = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    if (dur && isFinite(dur) && !isNaN(dur) && dur > 0) {
      setDuration(dur);
    } else if (initialDuration && initialDuration > 0) {
      setDuration(initialDuration);
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || !isFinite(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col bg-[#14161F] rounded-2xl border border-indigo-500/30 overflow-hidden shadow-2xl">
      <div className="relative aspect-video bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          src={playbackUrl}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationCheck}
          onLoadedMetadata={() => {
            handleDurationCheck();
            if (videoRef.current && videoRef.current.duration === Infinity) {
              videoRef.current.currentTime = 1e10;
              setTimeout(() => {
                if (videoRef.current) {
                  if (isFinite(videoRef.current.duration)) {
                    setDuration(videoRef.current.duration);
                  }
                  videoRef.current.currentTime = 0;
                }
              }, 100);
            }
          }}
          onEnded={() => setIsPlaying(false)}
          className="w-full h-full object-contain"
        />
      </div>

      {/* Permanently Visible Video Player Control Bar */}
      <div className="bg-[#181A24] border-t border-white/10 p-4 flex flex-col gap-3">
        {/* Seekbar */}
        <input
          type="range"
          min={0}
          max={duration && isFinite(duration) ? duration : 100}
          value={currentTime}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (videoRef.current) videoRef.current.currentTime = val;
            setCurrentTime(val);
          }}
          className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />

        <div className="flex items-center justify-between !text-white text-xs font-semibold">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="p-2 bg-indigo-600 hover:bg-indigo-500 !text-white rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center"
            >
              {isPlaying ? <Pause className="w-4 h-4 !text-white" /> : <Play className="w-4 h-4 fill-current !text-white" />}
            </button>
            <span className="!text-white font-mono text-xs font-bold">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Playback Speeds */}
            <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1 text-[11px]">
              {[0.5, 1.0, 1.25, 1.5, 2.0].map((s) => (
                <button
                  key={s}
                  onClick={() => handleSpeedChange(s)}
                  className={`px-2 py-0.5 rounded-lg font-bold transition-colors ${
                    playbackSpeed === s
                      ? 'bg-indigo-600 !text-white shadow-sm'
                      : '!text-gray-300 hover:!text-white hover:bg-white/10'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setIsMuted(!isMuted);
                if (videoRef.current) videoRef.current.muted = !isMuted;
              }}
              className="p-2 bg-white/10 hover:bg-white/20 !text-white rounded-xl transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 !text-white" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
