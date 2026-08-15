import { createServerClient } from "@/lib/supabase-server";
import { TranscriptionCard } from "@/components/transcription-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Plus, Search, ChevronDown } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import type { Transcription } from "@/lib/types";

export default async function DashboardPage() {
    const supabase = await createServerClient();

    // ─── Buscar todas as degravações (protótipo sem autenticação) ─────────
    const { data: rawTranscriptions, error } = await supabase
        .from("transcriptions")
        .select("*, utterances(count)")
        .order("created_at", { ascending: false });

    // Mapear para incluir utterance_count
    const transcriptions: Transcription[] = (rawTranscriptions ?? []).map((t) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = t as any;
        const countArr = raw.utterances;
        const utterance_count =
            Array.isArray(countArr) && countArr.length > 0
                ? countArr[0].count ?? 0
                : 0;
        const { utterances: _u, ...rest } = raw;
        return { ...rest, utterance_count } as Transcription;
    });

    if (error) {
        console.error("Error fetching transcriptions:", error);
    }

    const items = transcriptions ?? [];

    return (
        <div>
            {/* ─── Header & Filters ────────────────────────────────────── */}
            <div className="mb-6 flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">
                            Degravações
                        </h1>
                        <p className="mt-1 text-muted-foreground">
                            Visualização geral de todas as transcrições.
                        </p>
                    </div>

                    <Link href="/dashboard/new">
                        <Button className="bg-[#841b2d] hover:bg-[#6b1624] text-white shadow-sm font-medium w-full sm:w-auto">
                            <Plus className="mr-2 h-4 w-4" />
                            Nova Degravação
                        </Button>
                    </Link>
                </div>

                <div className="flex justify-end items-center gap-3">
                    <div className="relative w-full sm:w-[300px]">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="Busca..." className="pl-9 bg-white shadow-sm border-border rounded-lg" />
                    </div>
                    <Button variant="outline" className="bg-white shadow-sm border-border rounded-lg gap-2 text-foreground font-medium">
                        Filtres <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </Button>
                </div>
            </div>

            {items.length === 0 ? (
                <EmptyState
                    title="Nenhuma degravação"
                    description="Comece enviando um áudio ou vídeo de audiência."
                >
                    <Link href="/dashboard/new">
                        <Button className="gradient-primary font-semibold text-white shadow-md">
                            <Plus className="mr-2 h-4 w-4" />
                            Nova Degravação
                        </Button>
                    </Link>
                </EmptyState>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                    {items.map((t) => (
                        <TranscriptionCard key={t.id} transcription={t} />
                    ))}
                </div>
            )}
        </div>
    );
}
