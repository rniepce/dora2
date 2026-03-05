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
    playbackRate: number;
    activeUtteranceId: string | null;
    seekTo: (time: number) => void;
    togglePlay: () => void;
    play: () => void;
    pause: () => void;
    setPlaybackRate: (rate: number) => void;
}

export function useTimeSync({ utterances }: UseTimeSyncOptions): UseTimeSyncReturn {
    const mediaRef = useRef<HTMLMediaElement | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRateState] = useState(1);
    const [activeUtteranceId, setActiveUtteranceId] = useState<string | null>(null);

    // Atualiza currentTime via RAF para tracking suave (palavra a palavra)
    useEffect(() => {
        const media = mediaRef.current;
        if (!media) return;

        let rafId: number | null = null;

        const tick = () => {
            const t = media.currentTime;
            setCurrentTime(t);

            // Encontrar a utterance ativa pelo timestamp
            const active = utterances.find(
                (u) => t >= u.start_time && t <= u.end_time
            );
            setActiveUtteranceId(active?.id ?? null);

            rafId = requestAnimationFrame(tick);
        };

        const handlePlay = () => {
            setIsPlaying(true);
            rafId = requestAnimationFrame(tick);
        };
        const handlePause = () => {
            setIsPlaying(false);
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        };
        const handleSeeked = () => {
            // Update immediately on seek even if paused
            const t = media.currentTime;
            setCurrentTime(t);
            const active = utterances.find(
                (u) => t >= u.start_time && t <= u.end_time
            );
            setActiveUtteranceId(active?.id ?? null);
        };
        const handleDurationChange = () => setDuration(media.duration || 0);
        const handleLoadedMetadata = () => {
            setDuration(media.duration || 0);
            media.playbackRate = playbackRate; // restore rate after load
        };
        const handleRateChange = () => setPlaybackRateState(media.playbackRate);

        // If already playing on mount, start RAF loop
        if (!media.paused) {
            setIsPlaying(true);
            rafId = requestAnimationFrame(tick);
        }

        media.addEventListener("play", handlePlay);
        media.addEventListener("pause", handlePause);
        media.addEventListener("seeked", handleSeeked);
        media.addEventListener("durationchange", handleDurationChange);
        media.addEventListener("loadedmetadata", handleLoadedMetadata);
        media.addEventListener("ratechange", handleRateChange);

        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            media.removeEventListener("play", handlePlay);
            media.removeEventListener("pause", handlePause);
            media.removeEventListener("seeked", handleSeeked);
            media.removeEventListener("durationchange", handleDurationChange);
            media.removeEventListener("loadedmetadata", handleLoadedMetadata);
            media.removeEventListener("ratechange", handleRateChange);
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

    const setPlaybackRate = useCallback((rate: number) => {
        const media = mediaRef.current;
        if (media) media.playbackRate = rate;
        setPlaybackRateState(rate);
    }, []);

    return {
        mediaRef,
        currentTime,
        isPlaying,
        duration,
        playbackRate,
        activeUtteranceId,
        seekTo,
        togglePlay,
        play,
        pause,
        setPlaybackRate,
    };
}
