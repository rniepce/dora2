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
        icon: React.ReactNode;
        className: string;
        headerGlow?: string;
    }
> = {
    uploading: {
        label: "Enviando",
        icon: <Upload className="h-3 w-3" />,
        className: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
        headerGlow: "shadow-yellow-500/10",
    },
    transcribing: {
        label: "Transcrevendo",
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        className: "bg-blue-500/15 text-blue-600 border-blue-500/30",
        headerGlow: "shadow-blue-500/10",
    },
    formatting: {
        label: "Formatando",
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        className: "bg-purple-500/15 text-purple-600 border-purple-500/30",
        headerGlow: "shadow-purple-500/10",
    },
    completed: {
        label: "Concluído",
        icon: <CheckCircle2 className="h-3 w-3" />,
        className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
        headerGlow: "shadow-emerald-500/10",
    },
    error: {
        label: "Erro",
        icon: <AlertCircle className="h-3 w-3" />,
        className: "bg-red-500/15 text-red-600 border-red-500/30",
        headerGlow: "shadow-red-500/10",
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

    const engineLabel = transcription.engine === "deepgram" ? "Deepgram" : "Whisper";
    const EngineIcon = transcription.engine === "deepgram" ? AudioLines : Mic;
    const segmentCount = transcription.utterance_count ?? 0;

    const card = (
        <div
            className={`group/card relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-300
                ${isClickable && !confirming
                    ? "cursor-pointer hover:shadow-lg hover:shadow-primary/8 hover:-translate-y-0.5 hover:border-primary/25"
                    : !confirming ? "opacity-85" : ""
                }
                ${deleting ? "pointer-events-none opacity-50" : ""}
                ${confirming ? "border-red-500/40 !shadow-red-500/10" : "border-border/60"}
            `}
        >
            {/* ─── Gradient Header Bar ─────────────────────────────────── */}
            <div
                className={`relative h-20 overflow-hidden ${config.headerGlow} ${isShared ? "gradient-navy" : "gradient-primary"
                    }`}
            >
                {/* Decorative icon */}
                <div className="absolute -right-3 -top-3 opacity-[0.08]">
                    <FileText className="h-24 w-24 text-white" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/10 to-transparent" />

                {/* Status badge - overlaid on header */}
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                    <Badge
                        className={`flex items-center gap-1 border px-2 py-0.5 text-[10px] font-semibold shadow-sm ${config.className} bg-white/90 backdrop-blur-sm`}
                    >
                        {config.icon}
                        {config.label}
                    </Badge>

                    {/* Shared badge */}
                    {isShared && (
                        <Badge className="flex items-center gap-1 border border-blue-500/30 bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-600 shadow-sm backdrop-blur-sm">
                            <Users className="h-2.5 w-2.5" />
                            Compartilhado
                        </Badge>
                    )}
                </div>
            </div>

            {/* ─── Card Body ───────────────────────────────────────────── */}
            {confirming ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-5">
                    <p className="text-sm font-medium text-red-500">Apagar esta degravação?</p>
                    <div className="flex gap-2">
                        <button
                            onClick={handleConfirm}
                            className="rounded-lg bg-red-500/15 px-4 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/25"
                        >
                            Confirmar
                        </button>
                        <button
                            onClick={handleCancel}
                            className="rounded-lg bg-muted/60 px-4 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 flex-col gap-3 p-4">
                    {/* Title */}
                    <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground pr-6">
                        {transcription.title}
                    </h3>

                    {/* Shared by info */}
                    {isShared && transcription.shared_by_email && (
                        <p className="text-[11px] text-muted-foreground">
                            Por <span className="font-medium">{transcription.shared_by_email}</span>
                        </p>
                    )}

                    {/* Meta info row */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        {/* Engine tag */}
                        <span className="inline-flex items-center gap-1 rounded-md bg-secondary/80 px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground/80">
                            <EngineIcon className="h-2.5 w-2.5" />
                            {engineLabel}
                        </span>

                        {/* Segment count */}
                        {segmentCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-secondary/80 px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground/80">
                                <MessageSquareText className="h-2.5 w-2.5" />
                                {segmentCount} {segmentCount === 1 ? "fala" : "falas"}
                            </span>
                        )}
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Footer: timestamp */}
                    <div className="flex items-center gap-1.5 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDistanceToNow(transcription.created_at)}</span>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="group relative">
            {isClickable && !confirming ? (
                <Link href={`/editor/${transcription.id}`}>{card}</Link>
            ) : (
                card
            )}

            {/* Action buttons — outside Link to avoid navigation */}
            {!confirming && !deleting && !isShared && (
                <>
                    {/* Share button */}
                    {transcription.status === "completed" && (
                        <button
                            onClick={handleShareClick}
                            className="absolute right-10 top-[88px] z-10 rounded-md p-1.5 text-muted-foreground/50 opacity-0 transition-all hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
                            title="Compartilhar"
                        >
                            <Share2 className="h-3.5 w-3.5" />
                        </button>
                    )}

                    {/* Delete button */}
                    <button
                        onClick={handleDeleteClick}
                        disabled={deleting}
                        className="absolute right-3 top-[88px] z-10 rounded-md p-1.5 text-muted-foreground/50 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                        title="Apagar degravação"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </>
            )}

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
