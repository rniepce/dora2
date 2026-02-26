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

const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"]);

function isVideoUrl(url: string): boolean {
    const ext = url.split(".").pop()?.toLowerCase()?.split("?")[0] ?? "";
    return VIDEO_EXTENSIONS.has(ext);
}

export const MediaPlayer = forwardRef<HTMLVideoElement | HTMLAudioElement, MediaPlayerProps>(
    function MediaPlayer({ src, currentTime, duration, isPlaying, onTogglePlay, onSeek }, ref) {
        const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
        const isVideo = isVideoUrl(src);

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
                {/* Media element — ocupa o espaço disponível */}
                <div className="flex-1 min-h-0 bg-black flex items-center justify-center">
                    {isVideo ? (
                        <video
                            ref={ref as React.Ref<HTMLVideoElement>}
                            src={src}
                            preload="metadata"
                            className="h-full w-full object-contain"
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-3 text-white/60">
                            <Volume2 className="h-12 w-12" />
                            <p className="text-sm">Áudio</p>
                            <audio
                                ref={ref as React.Ref<HTMLAudioElement>}
                                src={src}
                                preload="metadata"
                            />
                        </div>
                    )}
                </div>

                {/* Controls bar */}
                <div className="p-3 space-y-2">
                    {/* Progress bar */}
                    <div
                        className="group relative h-8 cursor-pointer rounded-lg bg-gray-100 overflow-hidden"
                        onClick={handleProgressClick}
                    >
                        {/* Progress fill */}
                        <div
                            className="absolute inset-y-0 left-0 gradient-primary opacity-15 transition-all"
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

                    {/* Buttons */}
                    <div className="flex items-center justify-center gap-1">
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
