import { FileAudio } from "lucide-react";

interface EmptyStateProps {
    title?: string;
    description?: string;
    children?: React.ReactNode;
}

export function EmptyState({
    title = "Nenhuma degravação ainda",
    description = "Comece enviando o vídeo ou áudio de uma audiência judicial para transcrever automaticamente.",
    children,
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <FileAudio className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
            {children && <div className="mt-6">{children}</div>}
        </div>
    );
}
