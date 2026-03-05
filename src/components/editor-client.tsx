"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Scale, Download, Loader2, FileText, FileDown, MessageSquare, FileAudio, Search, X, Clock } from "lucide-react";

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
import type { Transcription, Utterance, Word } from "@/lib/types";

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

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac", "wma"]);

function isAudioUrl(url: string): boolean {
    try {
        const pathname = new URL(url, "https://placeholder.com").pathname;
        const ext = pathname.split(".").pop()?.toLowerCase() ?? "";
        return AUDIO_EXTENSIONS.has(ext);
    } catch {
        return false;
    }
}

function formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

interface SearchResult {
    word: string;
    start: number;
    speaker: string;
    utteranceText: string;
}

export function EditorClient({ transcription, utterances }: EditorClientProps) {
    const router = useRouter();
    const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);
    const [activeTab, setActiveTab] = useState<MobileTab>("transcript");
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const mediaUrl = transcription.media_url ?? "";
    const isAudio = isAudioUrl(mediaUrl);

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
        playbackRate,
        activeUtteranceId,
        seekTo,
        togglePlay,
        setPlaybackRate,
    } = useTimeSync({ utterances });

    const handleUtteranceClick = useCallback(
        (startTime: number) => {
            seekTo(startTime);
        },
        [seekTo]
    );

    // ─── Search ──────────────────────────────────────────────────────────
    const searchResults = useMemo<SearchResult[]>(() => {
        if (!searchQuery.trim() || searchQuery.trim().length < 2) return [];
        const q = searchQuery.trim().toLowerCase();
        const results: SearchResult[] = [];
        for (const utt of utterances) {
            if (utt.words) {
                for (const w of utt.words) {
                    if (w.word.toLowerCase().includes(q)) {
                        results.push({
                            word: w.word,
                            start: w.start,
                            speaker: utt.speaker_label,
                            utteranceText: utt.text,
                        });
                    }
                }
            } else if (utt.text.toLowerCase().includes(q)) {
                // Fallback: whole utterance match
                results.push({
                    word: q,
                    start: utt.start_time,
                    speaker: utt.speaker_label,
                    utteranceText: utt.text,
                });
            }
        }
        return results.slice(0, 50); // limit
    }, [searchQuery, utterances]);

    const handleSearchResultClick = useCallback(
        (startTime: number) => {
            seekTo(startTime);
            setSearchOpen(false);
            setSearchQuery("");
        },
        [seekTo]
    );

    // ─── Search header component (reused desktop & mobile) ───────────
    const TranscriptionHeader = (
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
            {searchOpen ? (
                <div className="flex items-center gap-2 flex-1">
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar palavra..."
                        autoFocus
                        className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
                    />
                    <button
                        onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <>
                    <h2 className="text-sm font-semibold text-foreground">
                        Transcrição
                    </h2>
                    <button
                        onClick={() => setSearchOpen(true)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-gray-100"
                        title="Buscar na transcrição"
                    >
                        <Search className="h-4 w-4" />
                    </button>
                </>
            )}
        </div>
    );

    // ─── Search results panel ────────────────────────────────────────
    const SearchResults = searchOpen && searchQuery.trim().length >= 2 && (
        <div className="border-b border-border bg-gray-50/50 max-h-48 overflow-y-auto">
            {searchResults.length === 0 ? (
                <p className="text-xs text-muted-foreground px-4 py-3">
                    Nenhum resultado encontrado
                </p>
            ) : (
                <div className="py-1">
                    <p className="text-[10px] text-muted-foreground px-4 py-1">
                        {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""}
                    </p>
                    {searchResults.map((r, i) => (
                        <button
                            key={`${r.start}-${i}`}
                            onClick={() => handleSearchResultClick(r.start)}
                            className="w-full text-left px-4 py-2 hover:bg-white transition-colors flex items-start gap-2 group"
                        >
                            <span className="shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground font-mono mt-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {formatTimestamp(r.start)}
                            </span>
                            <span className="text-xs text-foreground/80 line-clamp-1 group-hover:text-foreground">
                                <span className="text-[10px] font-semibold text-muted-foreground mr-1">
                                    {r.speaker}:
                                </span>
                                {highlightMatch(r.utteranceText, searchQuery)}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
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
            <div className={`hidden md:grid flex-1 grid-cols-[3fr_2fr] gap-3 p-3 min-h-0 ${isAudio ? "grid-rows-[auto_1fr]" : "grid-rows-[1.2fr_1fr]"}`}>
                {/* ↖ Superior Esquerdo — Vídeo/Áudio */}
                <div className={`min-h-0 min-w-0 ${isAudio ? "" : "max-h-[55vh]"}`}>
                    <MediaPlayer
                        ref={mediaRef}
                        src={mediaUrl}
                        isAudio={isAudio}
                        currentTime={currentTime}
                        duration={duration}
                        isPlaying={isPlaying}
                        playbackRate={playbackRate}
                        onTogglePlay={togglePlay}
                        onSeek={seekTo}
                        onPlaybackRateChange={setPlaybackRate}
                    />
                </div>

                {/* ↗ Superior Direito — Transcrição */}
                <div className="min-h-0 min-w-0 flex flex-col rounded-xl border border-border bg-white shadow-sm">
                    {TranscriptionHeader}
                    {SearchResults}
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <TranscriptPanel
                            utterances={utterances}
                            activeUtteranceId={activeUtteranceId}
                            currentTime={currentTime}
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
                <div className={`shrink-0 p-2 ${isAudio ? "h-auto" : "h-56 min-[480px]:h-64"}`}>
                    <MediaPlayer
                        ref={mediaRef}
                        src={mediaUrl}
                        isAudio={isAudio}
                        currentTime={currentTime}
                        duration={duration}
                        isPlaying={isPlaying}
                        playbackRate={playbackRate}
                        onTogglePlay={togglePlay}
                        onSeek={seekTo}
                        onPlaybackRateChange={setPlaybackRate}
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
                            {TranscriptionHeader}
                            {SearchResults}
                            <div className="flex-1 overflow-y-auto min-h-0">
                                <TranscriptPanel
                                    utterances={utterances}
                                    activeUtteranceId={activeUtteranceId}
                                    currentTime={currentTime}
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

/** Highlight matching text in a string */
function highlightMatch(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    // Show context around the match
    const contextStart = Math.max(0, idx - 30);
    const contextEnd = Math.min(text.length, idx + query.length + 30);
    const before = (contextStart > 0 ? "…" : "") + text.slice(contextStart, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length, contextEnd) + (contextEnd < text.length ? "…" : "");
    return (
        <>
            {before}
            <span className="bg-yellow-200 rounded-sm px-0.5 font-medium">{match}</span>
            {after}
        </>
    );
}
