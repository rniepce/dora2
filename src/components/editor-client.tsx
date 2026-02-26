"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Scale } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MediaPlayer } from "@/components/media-player";
import { TranscriptPanel } from "@/components/transcript-panel";
import { useTimeSync } from "@/hooks/use-time-sync";
import type { Transcription, Utterance } from "@/lib/types";

interface EditorClientProps {
    transcription: Transcription;
    utterances: Utterance[];
}

export function EditorClient({ transcription, utterances }: EditorClientProps) {
    const router = useRouter();

    const {
        mediaRef,
        currentTime,
        isPlaying,
        duration,
        activeUtteranceId,
        seekTo,
        togglePlay,
    } = useTimeSync({ utterances });

    const handleUtteranceClick = useCallback(
        (startTime: number) => {
            seekTo(startTime);
        },
        [seekTo]
    );

    return (
        <div className="gradient-bg min-h-screen">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-border bg-white/80 backdrop-blur-xl">
                <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/dashboard")}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="mr-1.5 h-4 w-4" />
                        Voltar
                    </Button>

                    <div className="h-6 w-px bg-border" />

                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md gradient-primary">
                            <Scale className="h-4 w-4 text-white" />
                        </div>
                        <h1 className="truncate text-sm font-semibold text-foreground">
                            {transcription.title}
                        </h1>
                    </div>
                </div>
            </header>

            {/* Editor content */}
            <div className="mx-auto max-w-7xl px-4 py-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
                    {/* Left: Media Player (sticky) */}
                    <div className="lg:sticky lg:top-20 lg:self-start">
                        <MediaPlayer
                            ref={mediaRef}
                            src={transcription.media_url ?? ""}
                            currentTime={currentTime}
                            duration={duration}
                            isPlaying={isPlaying}
                            onTogglePlay={togglePlay}
                            onSeek={seekTo}
                        />

                        {/* Stats */}
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-border bg-white p-3 text-center shadow-sm">
                                <p className="text-2xl font-bold text-foreground">{utterances.length}</p>
                                <p className="text-xs text-muted-foreground">Falas</p>
                            </div>
                            <div className="rounded-lg border border-border bg-white p-3 text-center shadow-sm">
                                <p className="text-2xl font-bold text-foreground">
                                    {new Set(utterances.map((u) => u.speaker_label)).size}
                                </p>
                                <p className="text-xs text-muted-foreground">Locutores</p>
                            </div>
                        </div>
                    </div>

                    {/* Right: Transcript */}
                    <div>
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-foreground">
                                Transcrição
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                Clique em uma fala para pular o áudio
                            </p>
                        </div>

                        <TranscriptPanel
                            utterances={utterances}
                            activeUtteranceId={activeUtteranceId}
                            onUtteranceClick={handleUtteranceClick}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
