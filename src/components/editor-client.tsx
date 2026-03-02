"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Scale, Download, Loader2, FileText, FileDown, MessageSquare, FileAudio } from "lucide-react";

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

type MobileTab = "transcript" | "summary" | "chat";

const MOBILE_TABS: { key: MobileTab; label: string; icon: React.ReactNode }[] = [
    { key: "transcript", label: "Transcrição", icon: <FileAudio className="h-4 w-4" /> },
    { key: "summary", label: "Resumo", icon: <FileText className="h-4 w-4" /> },
    { key: "chat", label: "Chat", icon: <MessageSquare className="h-4 w-4" /> },
];

export function EditorClient({ transcription, utterances }: EditorClientProps) {
    const router = useRouter();
    const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);
    const [activeTab, setActiveTab] = useState<MobileTab>("transcript");

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
        <div className="flex h-[100dvh] flex-col bg-background">
            {/* Header — compacto */}
            <header className="z-50 border-b border-border bg-white/80 backdrop-blur-xl">
                <div className="flex h-12 items-center gap-2 px-3 sm:gap-3 sm:px-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/dashboard")}
                        className="text-muted-foreground hover:text-foreground px-2 sm:px-3"
                    >
                        <ArrowLeft className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Voltar</span>
                    </Button>

                    <div className="h-5 w-px bg-border hidden sm:block" />

                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md gradient-primary">
                            <Scale className="h-3.5 w-3.5 text-white" />
                        </div>
                        <h1 className="truncate text-xs font-semibold text-foreground sm:text-sm">
                            {transcription.title}
                        </h1>
                    </div>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={exporting !== null}
                                className="ml-auto shrink-0 gap-1.5 text-xs px-2 sm:px-3"
                            >
                                {exporting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Download className="h-3.5 w-3.5" />
                                )}
                                <span className="hidden sm:inline">
                                    {exporting ? "Exportando..." : "Exportar"}
                                </span>
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

            {/* ═══════ DESKTOP: Layout 4 quadrantes ═══════ */}
            <div className="hidden md:grid flex-1 grid-cols-[3fr_2fr] grid-rows-[1.2fr_1fr] gap-3 p-3 min-h-0">
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

            {/* ═══════ MOBILE: Layout vertical com tabs ═══════ */}
            <div className="flex flex-1 flex-col min-h-0 md:hidden">
                {/* Media player compacto */}
                <div className="shrink-0 h-56 min-[480px]:h-64 p-2">
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

                {/* Tab bar */}
                <div className="shrink-0 flex border-b border-border bg-white px-1">
                    {MOBILE_TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${activeTab === tab.key
                                ? "border-b-2 border-primary text-primary"
                                : "text-muted-foreground"
                                }`}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 min-h-0 overflow-hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
                    {activeTab === "transcript" && (
                        <div className="h-full flex flex-col rounded-none border-0 bg-white">
                            <div className="flex-1 overflow-y-auto min-h-0">
                                <TranscriptPanel
                                    utterances={utterances}
                                    activeUtteranceId={activeUtteranceId}
                                    onUtteranceClick={handleUtteranceClick}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === "summary" && (
                        <div className="h-full">
                            <VideoSummary transcriptionId={transcription.id} />
                        </div>
                    )}

                    {activeTab === "chat" && (
                        <div className="h-full">
                            <ChatPanel transcriptionId={transcription.id} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

