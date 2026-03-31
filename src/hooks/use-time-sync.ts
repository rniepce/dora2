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

    // Use ref for utterances to avoid re-registering RAF loop when utterances change
    const utterancesRef = useRef(utterances);
    utterancesRef.current = utterances;

    // Helper: find active utterance by timestamp
    const findActiveUtterance = useCallback((t: number) => {
        const utts = utterancesRef.current;
        for (let i = utts.length - 1; i >= 0; i--) {
            if (t >= utts[i].start_time) {
                return utts[i];
            }
        }
        return null;
    }, []);

    // Atualiza currentTime via RAF para tracking suave (palavra a palavra)
    useEffect(() => {
        const media = mediaRef.current;
        if (!media) return;

        let rafId: number | null = null;

        const tick = () => {
            const t = media.currentTime;
            setCurrentTime(t);
            const active = findActiveUtterance(t);
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
            const t = media.currentTime;
            setCurrentTime(t);
            const active = findActiveUtterance(t);
            setActiveUtteranceId(active?.id ?? null);
        };
        const handleDurationChange = () => setDuration(media.duration || 0);
        const handleLoadedMetadata = () => {
            setDuration(media.duration || 0);
            media.playbackRate = playbackRate;
        };
        const handleRateChange = () => setPlaybackRateState(media.playbackRate);

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
    }, [playbackRate, findActiveUtterance]);

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
