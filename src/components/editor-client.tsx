"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Scale, Download, Loader2, FileText, FileDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MediaPlayer } from "@/components/media-player";
import { TranscriptPanel } from "@/components/transcript-panel";
import { VideoSummary } from "@/components/video-summary";
import { ChatPanel } from "@/components/chat-panel";
import { useTimeSync } from "@/hooks/use-time-sync";
import type { Transcription, Utterance } from "@/lib/types";

interface EditorClientProps {
    transcription: Transcription;
    utterances: Utterance[];
}

export function EditorClient({ transcription, utterances }: EditorClientProps) {
    const router = useRouter();
    const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);

    const handleExport = useCallback(async (format: "docx" | "pdf") => {
        setExporting(format);
        try {
            const endpoint = format === "docx" ? "/api/export" : "/api/export-pdf";
            const res = await fetch(`${endpoint}?id=${transcription.id}`);
            if (!res.ok) throw new Error("Falha ao exportar");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const safeName = transcription.title
                .replace(/[^a-zA-Z0-9\u00c0-\u00ff\s.-]/g, "")
                .replace(/\s+/g, "_");
            a.download = `${safeName}_degravacao.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert("Erro ao exportar degravação.");
        } finally {
            setExporting(null);
        }
    }, [transcription.id, transcription.title]);

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
        <div className="flex h-screen flex-col bg-background">
            {/* Header — compacto */}
            <header className="z-50 border-b border-border bg-white/80 backdrop-blur-xl">
                <div className="flex h-12 items-center gap-3 px-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/dashboard")}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="mr-1 h-4 w-4" />
                        Voltar
                    </Button>

                    <div className="h-5 w-px bg-border" />

                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md gradient-primary">
                            <Scale className="h-3.5 w-3.5 text-white" />
                        </div>
                        <h1 className="truncate text-sm font-semibold text-foreground">
                            {transcription.title}
                        </h1>
                    </div>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={exporting !== null}
                                className="ml-auto shrink-0 gap-1.5 text-xs"
                            >
                                {exporting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Download className="h-3.5 w-3.5" />
                                )}
                                {exporting ? "Exportando..." : "Exportar"}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                                onClick={() => handleExport("docx")}
                                disabled={exporting !== null}
                                className="cursor-pointer gap-2"
                            >
                                <FileText className="h-4 w-4 text-blue-500" />
                                <span>Documento (.docx)</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => handleExport("pdf")}
                                disabled={exporting !== null}
                                className="cursor-pointer gap-2"
                            >
                                <FileDown className="h-4 w-4 text-red-500" />
                                <span>PDF (.pdf)</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            {/* Layout 4 quadrantes — ocupa altura restante */}
            <div className="flex-1 grid grid-cols-[3fr_2fr] grid-rows-[1.2fr_1fr] gap-3 p-3 min-h-0">
                {/* ↖ Superior Esquerdo — Vídeo */}
                <div className="min-h-0 min-w-0">
                    <MediaPlayer
                        ref={mediaRef}
                        src={transcription.media_url ?? ""}
                        currentTime={currentTime}
                        duration={duration}
                        isPlaying={isPlaying}
                        onTogglePlay={togglePlay}
                        onSeek={seekTo}
                    />
                </div>

                {/* ↗ Superior Direito — Transcrição */}
                <div className="min-h-0 min-w-0 flex flex-col rounded-xl border border-border bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <h2 className="text-sm font-semibold text-foreground">
                            Transcrição
                        </h2>
                        <p className="text-[10px] text-muted-foreground">
                            Clique para pular o áudio
                        </p>
                    </div>
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <TranscriptPanel
                            utterances={utterances}
                            activeUtteranceId={activeUtteranceId}
                            onUtteranceClick={handleUtteranceClick}
                        />
                    </div>
                </div>

                {/* ↙ Inferior Esquerdo — Resumo */}
                <div className="min-h-0 min-w-0">
                    <VideoSummary transcriptionId={transcription.id} />
                </div>

                {/* ↘ Inferior Direito — Chat */}
                <div className="min-h-0 min-w-0">
                    <ChatPanel transcriptionId={transcription.id} />
                </div>
            </div>
        </div>
    );
}
