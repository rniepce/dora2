"use client";

import { useEffect, useRef } from "react";
import { Clock } from "lucide-react";
import type { Utterance } from "@/lib/types";

// Paleta TJMG — cores de fundo por tipo de locutor
const SPEAKER_COLORS: Record<string, { bg: string; accent: string; label: string }> = {
    "JUIZ(A)": { bg: "bg-amber-50", accent: "bg-amber-400", label: "text-amber-700" },
    "ADV. AUTOR": { bg: "bg-blue-50", accent: "bg-blue-400", label: "text-blue-700" },
    "ADV. RÉU": { bg: "bg-rose-50", accent: "bg-rose-400", label: "text-rose-700" },
    "PROMOTOR(A)": { bg: "bg-blue-50", accent: "bg-blue-400", label: "text-blue-700" },
    "DEFENSOR(A)": { bg: "bg-rose-50", accent: "bg-rose-400", label: "text-rose-700" },
    "TESTEMUNHA": { bg: "bg-purple-50", accent: "bg-purple-400", label: "text-purple-700" },
    "DEPOENTE": { bg: "bg-purple-50", accent: "bg-purple-400", label: "text-purple-700" },
    "RÉU": { bg: "bg-orange-50", accent: "bg-orange-400", label: "text-orange-700" },
    "AUTOR": { bg: "bg-cyan-50", accent: "bg-cyan-400", label: "text-cyan-700" },
    "ESCRIVÃO(Ã)": { bg: "bg-gray-50", accent: "bg-gray-400", label: "text-gray-600" },
};

const DEFAULT_COLOR = { bg: "bg-red-50", accent: "bg-red-400", label: "text-red-700" };

function getSpeakerColor(label: string) {
    return SPEAKER_COLORS[label] ?? DEFAULT_COLOR;
}

function formatTimestamp(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
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

    let lastSpeaker = "";

    return (
        <div className="transcript-continuous">
            {utterances.map((utterance) => {
                const isActive = utterance.id === activeUtteranceId;
                const color = getSpeakerColor(utterance.speaker_label);
                const isNewSpeaker = utterance.speaker_label !== lastSpeaker;
                lastSpeaker = utterance.speaker_label;

                return (
                    <div key={utterance.id} ref={isActive ? activeRef : undefined}>
                        {/* Speaker divider — aparece só quando o locutor muda */}
                        {isNewSpeaker && (
                            <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                                <div className={`h-3 w-1 rounded-full ${color.accent}`} />
                                <span className={`text-xs font-bold uppercase tracking-wide ${color.label}`}>
                                    {utterance.speaker_label}
                                </span>
                                <button
                                    className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                                    onClick={() => onUtteranceClick(utterance.start_time)}
                                >
                                    <Clock className="h-2.5 w-2.5" />
                                    {formatTimestamp(utterance.start_time)}
                                </button>
                            </div>
                        )}

                        {/* Texto da fala */}
                        <div
                            className={`cursor-pointer px-4 py-1 transition-all duration-150 border-l-2 ${isActive
                                    ? `${color.bg} border-l-2 ${color.accent.replace("bg-", "border-")} font-medium`
                                    : "border-transparent hover:bg-gray-50/60"
                                }`}
                            onClick={() => onUtteranceClick(utterance.start_time)}
                        >
                            <p className={`text-sm leading-relaxed ${isActive ? "text-foreground" : "text-foreground/75"
                                }`}>
                                {!isNewSpeaker && (
                                    <button
                                        className="mr-1.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors align-baseline"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onUtteranceClick(utterance.start_time);
                                        }}
                                    >
                                        {formatTimestamp(utterance.start_time)}
                                    </button>
                                )}
                                {utterance.text}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
