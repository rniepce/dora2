"use client";

import { forwardRef } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaPlayerProps {
    src: string;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    onTogglePlay: () => void;
    onSeek: (time: number) => void;
}

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

export const MediaPlayer = forwardRef<HTMLAudioElement, MediaPlayerProps>(
    function MediaPlayer({ src, currentTime, duration, isPlaying, onTogglePlay, onSeek }, ref) {
        const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

        const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            onSeek(percentage * duration);
        };

        const skipBack = () => onSeek(Math.max(0, currentTime - 10));
        const skipForward = () => onSeek(Math.min(duration, currentTime + 10));

        return (
            <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
                {/* Hidden HTML5 audio element */}
                <audio ref={ref} src={src} preload="metadata" />

                {/* Progress bar */}
                <div
                    className="group relative h-10 cursor-pointer rounded-lg bg-gray-100 overflow-hidden mb-4"
                    onClick={handleProgressClick}
                >
                    {/* Progress fill */}
                    <div
                        className="absolute inset-y-0 left-0 gradient-primary opacity-20 transition-all"
                        style={{ width: `${progress}%` }}
                    />
                    {/* Playhead */}
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-sm transition-all"
                        style={{ left: `${progress}%` }}
                    />
                    {/* Time overlay */}
                    <div className="absolute inset-0 flex items-center justify-between px-3 text-xs text-muted-foreground">
                        <span className="font-mono">{formatTime(currentTime)}</span>
                        <span className="font-mono">{formatTime(duration)}</span>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={skipBack}
                        className="text-muted-foreground hover:text-foreground"
                        title="Voltar 10s"
                    >
                        <SkipBack className="h-4 w-4" />
                    </Button>

                    <Button
                        onClick={onTogglePlay}
                        className="h-10 w-10 rounded-full gradient-primary text-white shadow-md hover:shadow-lg"
                        size="icon"
                    >
                        {isPlaying ? (
                            <Pause className="h-5 w-5" />
                        ) : (
                            <Play className="h-5 w-5 ml-0.5" />
                        )}
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={skipForward}
                        className="text-muted-foreground hover:text-foreground"
                        title="Avançar 10s"
                    >
                        <SkipForward className="h-4 w-4" />
                    </Button>

                    <div className="ml-4 flex items-center gap-1.5 text-muted-foreground">
                        <Volume2 className="h-4 w-4" />
                    </div>
                </div>
            </div>
        );
    }
);
