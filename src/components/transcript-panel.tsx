"use client";

import { useEffect, useRef } from "react";
import { User, Clock } from "lucide-react";
import type { Utterance } from "@/lib/types";

// Paleta TJMG — cores ajustadas para tema claro
const SPEAKER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    "JUIZ(A)": { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300" },
    "ADV. AUTOR": { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
    "ADV. RÉU": { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-300" },
    "PROMOTOR(A)": { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
    "DEFENSOR(A)": { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-300" },
    "TESTEMUNHA": { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" },
    "DEPOENTE": { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" },
    "RÉU": { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
    "AUTOR": { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-300" },
    "ESCRIVÃO(Ã)": { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
};

const DEFAULT_COLOR = { bg: "bg-red-50", text: "text-red-800", border: "border-red-200" };

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
                                : "border-border bg-white hover:border-primary/20 hover:bg-red-50/30 hover:shadow-sm"
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
                                        : "text-muted-foreground group-hover:text-foreground"
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
                            className={`text-sm leading-relaxed ${isActive ? "text-foreground font-medium" : "text-foreground/80"
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
