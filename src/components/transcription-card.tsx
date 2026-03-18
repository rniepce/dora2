"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDistanceToNow } from "@/lib/format-date";
import {
    FileText,
    Clock,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Upload,
    Trash2,
    Mic,
    AudioLines,
    Globe,
    MessageSquareText,
    Share2,
    Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ShareModal } from "@/components/share-modal";
import { deleteTranscriptionAction } from "@/lib/actions/transcription";
import type { Transcription, TranscriptionStatus } from "@/lib/types";

const statusConfig: Record<
    TranscriptionStatus,
    {
        label: string;
        className: string;
    }
> = {
    uploading: {
        label: "Enviando",
        className: "bg-yellow-600 text-white",
    },
    transcribing: {
        label: "Processando",
        className: "bg-[#2e7d32] text-white",
    },
    formatting: {
        label: "Formatando",
        className: "bg-[#2e7d32] text-white",
    },
    completed: {
        label: "Concluído",
        className: "bg-[#841b2d] text-white", // TJMG Maroon
    },
    error: {
        label: "Erro",
        className: "bg-red-600 text-white",
    },
};

export function TranscriptionCard({ transcription }: { transcription: Transcription }) {
    const config = statusConfig[transcription.status];
    const isClickable = transcription.status === "completed";
    const isShared = transcription.is_shared === true;
    const router = useRouter();
    const [deleting, setDeleting] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setConfirming(true);
    };

    const handleConfirm = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDeleting(true);
        setConfirming(false);
        const result = await deleteTranscriptionAction(transcription.id);
        if (result.error) {
            alert(result.error);
            setDeleting(false);
        } else {
            router.refresh();
        }
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setConfirming(false);
    };

    const handleShareClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShareOpen(true);
    };

    const engineLabel = transcription.engine === "deepgram" ? "Deepgram" : transcription.engine === "google" ? "Chirp 3" : "Whisper";
    const EngineIcon = transcription.engine === "deepgram" ? AudioLines : transcription.engine === "google" ? Globe : Mic;
    const segmentCount = transcription.utterance_count ?? 0;

    const formattedDate = new Date(transcription.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).replace(' de ', ' de ').replace(',', ' -');

    const handleCardClick = (e: React.MouseEvent) => {
        if (!isClickable || confirming || deleting ||
            (e.target as HTMLElement).closest('button')) {
            return;
        }
        router.push(`/editor/${transcription.id}`);
    };

    return (
        <div className="group relative">
            <div
                onClick={handleCardClick}
                className={`group/card relative flex flex-col p-5 bg-white rounded-2xl border transition-all duration-300 min-h-[140px] shadow-sm
                    ${isClickable && !confirming
                        ? "cursor-pointer hover:border-[#841b2d]/40"
                        : !confirming ? "opacity-85" : ""
                    }
                    ${deleting ? "pointer-events-none opacity-50" : ""}
                    ${confirming ? "border-red-500/40" : transcription.status === 'completed' ? "border-[#841b2d]/30" : "border-border"}
                `}
            >
                {confirming ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3">
                        <p className="text-sm font-medium text-red-500">Apagar esta degravação?</p>
                        <div className="flex gap-2">
                            <button onClick={handleConfirm} className="rounded-lg bg-red-500/15 px-4 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/25">
                                Confirmar
                            </button>
                            <button onClick={handleCancel} className="rounded-lg bg-muted/60 px-4 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted">
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Top Row: Status Badge and Hover Actions */}
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex gap-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${config.className}`}>
                                    {config.label}
                                </span>
                                {isShared && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                                        Compartilhado
                                    </span>
                                )}
                            </div>
                            
                            {/* Hover Actions */}
                            <div className="flex bg-white/80 rounded backdrop-blur-sm opacity-0 group-hover/card:opacity-100 transition-opacity">
                                {!isShared && transcription.status === "completed" && (
                                    <button
                                        onClick={handleShareClick}
                                        className="p-1.5 text-muted-foreground hover:text-[#841b2d] hover:bg-red-50 rounded-md transition-colors"
                                        title="Compartilhar"
                                    >
                                        <Share2 className="h-4 w-4" />
                                    </button>
                                )}
                                {!isShared && (
                                    <button
                                        onClick={handleDeleteClick}
                                        disabled={deleting}
                                        className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                        title="Apagar degravação"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Meta Data */}
                        <div className="flex flex-col flex-1 mt-1">
                            <h3 className="text-[15px] font-bold text-foreground line-clamp-2 leading-tight mb-2">
                                {transcription.title}
                            </h3>
                            
                            <div className="space-y-1.5 mt-auto pt-2">
                                <div className="flex items-center gap-2 text-[13px] text-muted-foreground font-medium">
                                    <Clock className="h-4 w-4 text-gray-400" />
                                    {formattedDate}
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground font-medium">
                                        <MessageSquareText className="h-4 w-4 text-gray-400" />
                                        {segmentCount} Falas
                                    </div>
                                    
                                    {isClickable && (
                                        <FileText className="h-5 w-5 text-gray-400" />
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Share modal */}
            {!isShared && (
                <ShareModal
                    transcriptionId={transcription.id}
                    transcriptionTitle={transcription.title}
                    open={shareOpen}
                    onOpenChange={setShareOpen}
                />
            )}
        </div>
    );
}
