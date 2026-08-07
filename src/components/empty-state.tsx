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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-16 text-center">
            <FileAudio className="mb-4 h-8 w-8 stroke-[1.4] text-muted-foreground" />
            <h3 className="text-[17px] font-semibold tracking-tight text-foreground">{title}</h3>
            <p className="mt-2 max-w-sm text-[15px] text-muted-foreground">{description}</p>
            {children && <div className="mt-6">{children}</div>}
        </div>
    );
}
