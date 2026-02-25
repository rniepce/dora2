"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Utterance } from "@/lib/types";

interface UseTimeSyncOptions {
    utterances: Utterance[];
}

interface UseTimeSyncReturn {
    mediaRef: React.RefObject<HTMLMediaElement | null>;
    currentTime: number;
    isPlaying: boolean;
    duration: number;
    activeUtteranceId: string | null;
    seekTo: (time: number) => void;
    togglePlay: () => void;
    play: () => void;
    pause: () => void;
}

export function useTimeSync({ utterances }: UseTimeSyncOptions): UseTimeSyncReturn {
    const mediaRef = useRef<HTMLMediaElement | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [activeUtteranceId, setActiveUtteranceId] = useState<string | null>(null);

    // Atualiza currentTime e determina a utterance ativa
    useEffect(() => {
        const media = mediaRef.current;
        if (!media) return;

        const handleTimeUpdate = () => {
            const t = media.currentTime;
            setCurrentTime(t);

            // Encontrar a utterance ativa pelo timestamp
            const active = utterances.find(
                (u) => t >= u.start_time && t <= u.end_time
            );
            setActiveUtteranceId(active?.id ?? null);
        };

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleDurationChange = () => setDuration(media.duration || 0);
        const handleLoadedMetadata = () => setDuration(media.duration || 0);

        media.addEventListener("timeupdate", handleTimeUpdate);
        media.addEventListener("play", handlePlay);
        media.addEventListener("pause", handlePause);
        media.addEventListener("durationchange", handleDurationChange);
        media.addEventListener("loadedmetadata", handleLoadedMetadata);

        return () => {
            media.removeEventListener("timeupdate", handleTimeUpdate);
            media.removeEventListener("play", handlePlay);
            media.removeEventListener("pause", handlePause);
            media.removeEventListener("durationchange", handleDurationChange);
            media.removeEventListener("loadedmetadata", handleLoadedMetadata);
        };
    }, [utterances]);

    // Pula o player para um timestamp específico
    const seekTo = useCallback((time: number) => {
        const media = mediaRef.current;
        if (media) {
            media.currentTime = time;
            media.play().catch(() => { });
        }
    }, []);

    const togglePlay = useCallback(() => {
        const media = mediaRef.current;
        if (!media) return;
        if (media.paused) {
            media.play().catch(() => { });
        } else {
            media.pause();
        }
    }, []);

    const play = useCallback(() => {
        mediaRef.current?.play().catch(() => { });
    }, []);

    const pause = useCallback(() => {
        mediaRef.current?.pause();
    }, []);

    return {
        mediaRef,
        currentTime,
        isPlaying,
        duration,
        activeUtteranceId,
        seekTo,
        togglePlay,
        play,
        pause,
    };
}
