"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDistanceToNow } from "@/lib/format-date";
import { FileText, Clock, CheckCircle2, AlertCircle, Loader2, Upload, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { deleteTranscriptionAction } from "@/lib/actions/transcription";
import type { Transcription, TranscriptionStatus } from "@/lib/types";

const statusConfig: Record<
    TranscriptionStatus,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode; className?: string }
> = {
    uploading: {
        label: "Enviando",
        variant: "secondary",
        icon: <Upload className="h-3 w-3" />,
        className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    },
    transcribing: {
        label: "Transcrevendo",
        variant: "secondary",
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    },
    formatting: {
        label: "Formatando",
        variant: "secondary",
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        className: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    },
    completed: {
        label: "Concluído",
        variant: "default",
        icon: <CheckCircle2 className="h-3 w-3" />,
        className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    },
    error: {
        label: "Erro",
        variant: "destructive",
        icon: <AlertCircle className="h-3 w-3" />,
        className: "bg-red-500/15 text-red-400 border-red-500/30",
    },
};

export function TranscriptionCard({ transcription }: { transcription: Transcription }) {
    const config = statusConfig[transcription.status];
    const isClickable = transcription.status === "completed";
    const router = useRouter();
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm("Tem certeza que deseja apagar esta degravação?")) return;
        setDeleting(true);
        const result = await deleteTranscriptionAction(transcription.id);
        if (result.error) {
            alert(result.error);
            setDeleting(false);
        } else {
            router.refresh();
        }
    };

    const content = (
        <Card
            className={`group relative border-border/50 bg-card/60 backdrop-blur-sm transition-all duration-300 ${isClickable
                ? "cursor-pointer hover:border-primary/40 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5"
                : "opacity-80"
                } ${deleting ? "pointer-events-none opacity-50" : ""}`}
        >
            <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                            <FileText className="h-4 w-4" />
                        </div>
                        <h3 className="truncate font-semibold text-sm text-foreground">{transcription.title}</h3>
                    </div>

                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground/60 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                        title="Apagar degravação"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDistanceToNow(transcription.created_at)}</span>
                    </div>

                    <Badge
                        variant={config.variant}
                        className={`flex shrink-0 items-center gap-1 border px-2 py-0.5 text-[10px] font-medium ${config.className}`}
                    >
                        {config.icon}
                        {config.label}
                    </Badge>
                </div>
            </CardContent>
        </Card>
    );

    if (isClickable) {
        return <Link href={`/editor/${transcription.id}`}>{content}</Link>;
    }

    return content;
}
