"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FileText, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoSummaryProps {
    transcriptionId: string;
}

/** Renderiza inline markdown: **bold** e *italic* */
function renderInline(text: string): ReactNode[] {
    const parts: ReactNode[] = [];
    // Regex: captura **bold**, *italic*, ou texto normal
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
        // Texto antes do match
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        if (match[2]) {
            // **bold**
            parts.push(
                <strong key={key++} className="font-semibold text-foreground">
                    {match[2]}
                </strong>
            );
        } else if (match[3]) {
            // *italic*
            parts.push(
                <em key={key++} className="italic">
                    {match[3]}
                </em>
            );
        }

        lastIndex = match.index + match[0].length;
    }

    // Texto restante
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
}

export function VideoSummary({ transcriptionId }: VideoSummaryProps) {
    const [summary, setSummary] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSummary = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcriptionId }),
            });

            if (!res.ok) {
                throw new Error("Falha ao gerar resumo");
            }

            const data = await res.json();
            setSummary(data.summary);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro desconhecido");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transcriptionId]);

    return (
        <div className="flex h-full flex-col rounded-xl border border-border bg-white shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md gradient-navy">
                        <FileText className="h-3.5 w-3.5 text-white" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">Resumo</h3>
                </div>
                {!loading && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchSummary}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        title="Regenerar resumo"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
                {loading && (
                    <div className="flex flex-col items-center justify-center gap-3 py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Gerando resumo com IA...</p>
                    </div>
                )}

                {error && (
                    <div className="flex flex-col items-center justify-center gap-3 py-8">
                        <AlertCircle className="h-6 w-6 text-destructive" />
                        <p className="text-sm text-destructive">{error}</p>
                        <Button variant="outline" size="sm" onClick={fetchSummary}>
                            Tentar novamente
                        </Button>
                    </div>
                )}

                {summary && !loading && (
                    <div className="max-w-none text-foreground/90 space-y-1">
                        {summary.split("\n").map((line, i) => {
                            const trimmed = line.trim();

                            // Linha vazia
                            if (!trimmed) return <div key={i} className="h-2" />;

                            // Horizontal rule ---
                            if (/^-{3,}$/.test(trimmed)) {
                                return <hr key={i} className="my-2 border-border" />;
                            }

                            // ### Heading 3
                            if (trimmed.startsWith("### ")) {
                                return (
                                    <h4 key={i} className="mb-1 mt-3 text-sm font-bold text-foreground">
                                        {renderInline(trimmed.slice(4))}
                                    </h4>
                                );
                            }

                            // ## Heading 2
                            if (trimmed.startsWith("## ")) {
                                return (
                                    <h3 key={i} className="mb-1 mt-3 text-sm font-bold text-foreground">
                                        {renderInline(trimmed.slice(3))}
                                    </h3>
                                );
                            }

                            // # Heading 1
                            if (trimmed.startsWith("# ")) {
                                return (
                                    <h3 key={i} className="mb-1 mt-3 text-base font-bold text-foreground">
                                        {renderInline(trimmed.slice(2))}
                                    </h3>
                                );
                            }

                            // Bullet list
                            if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
                                return (
                                    <p key={i} className="mb-0.5 pl-3 text-sm leading-relaxed">
                                        <span className="mr-1.5 text-muted-foreground">•</span>
                                        {renderInline(trimmed.slice(2))}
                                    </p>
                                );
                            }

                            // Regular paragraph — com inline bold/italic
                            return (
                                <p key={i} className="mb-1 text-sm leading-relaxed">
                                    {renderInline(line)}
                                </p>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
