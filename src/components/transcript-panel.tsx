"use client";

import { useEffect, useRef } from "react";
import { User, Clock } from "lucide-react";
import type { Utterance } from "@/lib/types";

// Paleta de cores para diferentes locutores
const SPEAKER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    "JUIZ(A)": { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
    "ADV. AUTOR": { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30" },
    "ADV. RÉU": { bg: "bg-rose-500/15", text: "text-rose-400", border: "border-rose-500/30" },
    "PROMOTOR(A)": { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30" },
    "DEFENSOR(A)": { bg: "bg-rose-500/15", text: "text-rose-400", border: "border-rose-500/30" },
    "TESTEMUNHA": { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/30" },
    "DEPOENTE": { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/30" },
    "RÉU": { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" },
    "AUTOR": { bg: "bg-cyan-500/15", text: "text-cyan-400", border: "border-cyan-500/30" },
    "ESCRIVÃO(Ã)": { bg: "bg-gray-500/15", text: "text-gray-400", border: "border-gray-500/30" },
};

const DEFAULT_COLOR = { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" };

function getSpeakerColor(label: string) {
    return SPEAKER_COLORS[label] ?? DEFAULT_COLOR;
}

function formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

interface TranscriptPanelProps {
    utterances: Utterance[];
    activeUtteranceId: string | null;
    onUtteranceClick: (startTime: number) => void;
}

export function TranscriptPanel({
    utterances,
    activeUtteranceId,
    onUtteranceClick,
}: TranscriptPanelProps) {
    const activeRef = useRef<HTMLDivElement>(null);

    // Auto-scroll para a utterance ativa
    useEffect(() => {
        if (activeRef.current) {
            activeRef.current.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });
        }
    }, [activeUtteranceId]);

    return (
        <div className="space-y-2">
            {utterances.map((utterance) => {
                const isActive = utterance.id === activeUtteranceId;
                const color = getSpeakerColor(utterance.speaker_label);

                return (
                    <div
                        key={utterance.id}
                        ref={isActive ? activeRef : undefined}
                        className={`group cursor-pointer rounded-lg border p-3 transition-all duration-200 ${isActive
                                ? `${color.border} ${color.bg} shadow-md ring-1 ${color.border}`
                                : "border-border/30 bg-card/30 hover:border-border/50 hover:bg-card/50"
                            }`}
                        onClick={() => onUtteranceClick(utterance.start_time)}
                    >
                        {/* Header: speaker + timestamp */}
                        <div className="mb-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`flex h-6 items-center gap-1 rounded-md border px-2 text-xs font-semibold ${color.bg} ${color.text} ${color.border}`}>
                                    <User className="h-3 w-3" />
                                    {utterance.speaker_label}
                                </div>
                            </div>
                            <button
                                className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors ${isActive
                                        ? `${color.text}`
                                        : "text-muted-foreground/60 group-hover:text-muted-foreground"
                                    }`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUtteranceClick(utterance.start_time);
                                }}
                            >
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(utterance.start_time)}
                            </button>
                        </div>

                        {/* Text */}
                        <p
                            className={`text-sm leading-relaxed ${isActive ? "text-foreground" : "text-foreground/80"
                                }`}
                        >
                            {utterance.text}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}
