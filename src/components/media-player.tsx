"use client";

import { forwardRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaPlayerProps {
    src: string;
    isAudio?: boolean;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    playbackRate: number;
    onTogglePlay: () => void;
    onSeek: (time: number) => void;
    onPlaybackRateChange: (rate: number) => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

function formatTime(seconds: number): string {
    if (!seconds || !isFinite(seconds)) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
}

export const MediaPlayer = forwardRef<HTMLMediaElement, MediaPlayerProps>(
    function MediaPlayer({
        src, isAudio, currentTime, duration, isPlaying,
        playbackRate, onTogglePlay, onSeek, onPlaybackRateChange,
    }, ref) {
        const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
        const [showSpeedMenu, setShowSpeedMenu] = useState(false);

        const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            onSeek(percentage * duration);
        };

        const skipBack = () => onSeek(Math.max(0, currentTime - 10));
        const skipForward = () => onSeek(Math.min(duration, currentTime + 10));

        return (
            <div className="flex h-full flex-col rounded-xl border border-border bg-white shadow-sm overflow-hidden">
                {/* Media area */}
                <div className={`flex-1 min-h-0 bg-black flex items-center justify-center ${isAudio ? "max-h-32" : ""}`}>
                    {isAudio ? (
                        <>
                            <audio
                                ref={ref as React.Ref<HTMLAudioElement>}
                                src={src}
                                preload="metadata"
                            />
                            <div className="flex flex-col items-center gap-2 text-white/60 py-6">
                                <div className="relative">
                                    <Volume2 className="h-10 w-10" />
                                    {isPlaying && (
                                        <div className="absolute -right-4 top-1/2 -translate-y-1/2 flex items-end gap-[2px]">
                                            {[1, 2, 3].map((i) => (
                                                <div
                                                    key={i}
                                                    className="w-[3px] bg-white/50 rounded-full animate-pulse"
                                                    style={{
                                                        height: `${8 + i * 4}px`,
                                                        animationDelay: `${i * 150}ms`,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs">Áudio</p>
                            </div>
                        </>
                    ) : (
                        <video
                            ref={ref as React.Ref<HTMLVideoElement>}
                            src={src}
                            preload="metadata"
                            playsInline
                            className="h-full w-full object-contain"
                        />
                    )}
                </div>

                {/* Controls bar */}
                <div className="p-2 space-y-1.5 sm:p-3 sm:space-y-2">
                    {/* Progress bar */}
                    <div
                        className="group relative h-10 sm:h-8 cursor-pointer rounded-lg bg-gray-100 overflow-hidden"
                        onClick={handleProgressClick}
                    >
                        <div
                            className="absolute inset-y-0 left-0 gradient-primary opacity-15 transition-all"
                            style={{ width: `${progress}%` }}
                        />
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-sm transition-all"
                            style={{ left: `${progress}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-between px-3 text-xs text-muted-foreground">
                            <span className="font-mono">{formatTime(currentTime)}</span>
                            <span className="font-mono">{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center justify-center gap-1">
                        {/* Speed selector */}
                        <div className="relative">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                                className="text-muted-foreground hover:text-foreground h-8 px-1.5 text-[11px] font-mono min-w-[42px]"
                                title="Velocidade"
                            >
                                {playbackRate}x
                            </Button>
                            {showSpeedMenu && (
                                <>
                                    {/* Backdrop to close */}
                                    <div className="fixed inset-0 z-40" onClick={() => setShowSpeedMenu(false)} />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 bg-white rounded-lg shadow-lg border border-border py-1 min-w-[64px]">
                                        {SPEED_OPTIONS.map((speed) => (
                                            <button
                                                key={speed}
                                                onClick={() => {
                                                    onPlaybackRateChange(speed);
                                                    setShowSpeedMenu(false);
                                                }}
                                                className={`w-full px-3 py-1.5 text-xs font-mono text-left hover:bg-gray-50 transition-colors ${speed === playbackRate
                                                    ? "text-primary font-semibold bg-primary/5"
                                                    : "text-muted-foreground"
                                                    }`}
                                            >
                                                {speed}x
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={skipBack}
                            className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
                            title="Voltar 10s"
                        >
                            <SkipBack className="h-4 w-4" />
                        </Button>

                        <Button
                            onClick={onTogglePlay}
                            className="h-9 w-9 rounded-full gradient-primary text-white shadow-md hover:shadow-lg"
                            size="icon"
                        >
                            {isPlaying ? (
                                <Pause className="h-4 w-4" />
                            ) : (
                                <Play className="h-4 w-4 ml-0.5" />
                            )}
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={skipForward}
                            className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
                            title="Avançar 10s"
                        >
                            <SkipForward className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
        );
    }
);
