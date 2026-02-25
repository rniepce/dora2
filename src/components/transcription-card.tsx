import Link from "next/link";
import { formatDistanceToNow } from "@/lib/format-date";
import { FileText, Clock, CheckCircle2, AlertCircle, Loader2, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

    const content = (
        <Card
            className={`group border-border/50 bg-card/60 backdrop-blur-sm transition-all duration-300 ${isClickable
                    ? "cursor-pointer hover:border-primary/40 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5"
                    : "opacity-80"
                }`}
        >
            <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                    <FileText className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-foreground">{transcription.title}</h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDistanceToNow(transcription.created_at)}</span>
                    </div>
                </div>

                <Badge
                    variant={config.variant}
                    className={`flex shrink-0 items-center gap-1.5 border px-2.5 py-1 text-xs font-medium ${config.className}`}
                >
                    {config.icon}
                    {config.label}
                </Badge>
            </CardContent>
        </Card>
    );

    if (isClickable) {
        return <Link href={`/editor/${transcription.id}`}>{content}</Link>;
    }

    return content;
}
