"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
    FileText,
    Clock,
    Trash2,
    Mic,
    AudioLines,
    Globe,
    Share2,
} from "lucide-react";
import { ShareModal } from "@/components/share-modal";
import { deleteTranscriptionAction } from "@/lib/actions/transcription";
import type { Transcription, TranscriptionStatus } from "@/lib/types";

/**
 * Status em pílulas neutras com um ponto colorido — a cor entra como sinal,
 * não como preenchimento, seguindo a identidade do Assistente TJMG.
 */
const statusConfig: Record<
    TranscriptionStatus,
    {
        label: string;
        dotClassName: string;
    }
> = {
    uploading: {
        label: "Enviando",
        dotClassName: "bg-amber-500",
    },
    transcribing: {
        label: "Processando",
        dotClassName: "bg-amber-500",
    },
    formatting: {
        label: "Formatando",
        dotClassName: "bg-amber-500",
    },
    completed: {
        label: "Concluído",
        dotClassName: "bg-emerald-600",
    },
    error: {
        label: "Erro",
        dotClassName: "bg-primary",
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
                className={`group/card relative flex min-h-[150px] flex-col rounded-2xl border bg-card p-5 transition-colors duration-200
                    ${isClickable && !confirming
                        ? "cursor-pointer hover:border-foreground/25 hover:bg-secondary/40"
                        : !confirming ? "opacity-80" : ""
                    }
                    ${deleting ? "pointer-events-none opacity-50" : ""}
                    ${confirming ? "border-primary/40" : "border-border"}
                `}
            >
                {confirming ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3">
                        <p className="text-sm font-medium text-foreground">Apagar esta degravação?</p>
                        <div className="flex gap-2">
                            <button onClick={handleConfirm} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                                Confirmar
                            </button>
                            <button onClick={handleCancel} className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary">
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Top Row: Status Badge and Hover Actions */}
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex flex-wrap gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground">
                                    <span className={`h-1.5 w-1.5 rounded-full ${config.dotClassName}`} />
                                    {config.label}
                                </span>
                                {isShared && (
                                    <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                                        Compartilhado
                                    </span>
                                )}
                            </div>

                            {/* Hover Actions */}
                            <div className="flex opacity-0 transition-opacity group-hover/card:opacity-100">
                                {!isShared && transcription.status === "completed" && (
                                    <button
                                        onClick={handleShareClick}
                                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                        title="Compartilhar"
                                    >
                                        <Share2 className="h-4 w-4" />
                                    </button>
                                )}
                                {!isShared && (
                                    <button
                                        onClick={handleDeleteClick}
                                        disabled={deleting}
                                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                                        title="Apagar degravação"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Meta Data */}
                        <div className="flex flex-col flex-1 mt-1">
                            <h3 className="mb-2 line-clamp-2 text-[16px] font-semibold leading-snug tracking-tight text-foreground">
                                {transcription.title}
                            </h3>

                            <div className="mt-auto space-y-1.5 pt-2">
                                <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                                    <Clock className="h-4 w-4 stroke-[1.6] text-muted-foreground/70" />
                                    {formattedDate}
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                                        <EngineIcon className="h-4 w-4 stroke-[1.6] text-muted-foreground/70" />
                                        {engineLabel} · {segmentCount} falas
                                    </div>

                                    {isClickable && (
                                        <FileText className="h-[18px] w-[18px] stroke-[1.6] text-muted-foreground/70" />
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
