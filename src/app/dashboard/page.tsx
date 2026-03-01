import { createServerClient } from "@/lib/supabase-server";
import { TranscriptionCard } from "@/components/transcription-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";
import Link from "next/link";
import type { Transcription } from "@/lib/types";

export default async function DashboardPage() {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    // ─── Buscar degravações do usuário logado ─────────────────────────────
    const { data: rawTranscriptions, error } = await supabase
        .from("transcriptions")
        .select("*, utterances(count)")
        .eq("user_id", user!.id)
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

    // ─── Buscar degravações compartilhadas comigo ─────────────────────────
    const { data: sharedRecords } = await supabase
        .from("shared_transcriptions")
        .select("transcription_id, shared_by, created_at")
        .eq("shared_with", user!.id)
        .order("created_at", { ascending: false });

    let sharedTranscriptions: Transcription[] = [];

    if (sharedRecords && sharedRecords.length > 0) {
        const sharedIds = sharedRecords.map((s) => s.transcription_id);

        const { data: rawShared } = await supabase
            .from("transcriptions")
            .select("*, utterances(count)")
            .in("id", sharedIds)
            .order("created_at", { ascending: false });

        // Buscar emails dos donos
        const ownerIds = sharedRecords.map((s) => s.shared_by);
        const { data: ownerEmails } = await supabase
            .rpc("get_user_emails_by_ids", { user_ids: ownerIds });

        const emailMap: Record<string, string> = {};
        if (ownerEmails) {
            for (const u of ownerEmails) {
                emailMap[u.id] = u.email;
            }
        }

        // Mapear shared_by para email
        const sharedByMap: Record<string, string> = {};
        for (const s of sharedRecords) {
            sharedByMap[s.transcription_id] = emailMap[s.shared_by] ?? "Desconhecido";
        }

        sharedTranscriptions = (rawShared ?? []).map((t) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const raw = t as any;
            const countArr = raw.utterances;
            const utterance_count =
                Array.isArray(countArr) && countArr.length > 0
                    ? countArr[0].count ?? 0
                    : 0;
            const { utterances: _u, ...rest } = raw;
            return {
                ...rest,
                utterance_count,
                is_shared: true,
                shared_by_email: sharedByMap[rest.id] ?? "Desconhecido",
            } as Transcription;
        });
    }

    const items = transcriptions ?? [];

    return (
        <div>
            {/* ─── Minhas Degravações ──────────────────────────────────── */}
            <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                        Degravações
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                        {items.length === 0
                            ? "Nenhuma degravação ainda"
                            : `${items.length} ${items.length !== 1 ? "degravações" : "degravação"}`}
                    </p>
                </div>

                <Link href="/dashboard/new">
                    <Button className="gradient-primary w-full font-semibold text-white shadow-md sm:w-auto">
                        <Plus className="mr-2 h-4 w-4" />
                        Nova Degravação
                    </Button>
                </Link>
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

            {/* ─── Compartilhadas Comigo ──────────────────────────────── */}
            {sharedTranscriptions.length > 0 && (
                <div className="mt-12">
                    <div className="mb-6 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-navy shadow-sm">
                            <Users className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                Compartilhadas comigo
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                {sharedTranscriptions.length} {sharedTranscriptions.length !== 1 ? "degravações recebidas" : "degravação recebida"}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                        {sharedTranscriptions.map((t) => (
                            <TranscriptionCard key={`shared-${t.id}`} transcription={t} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
