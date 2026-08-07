import { createServerClient } from "@/lib/supabase-server";
import { TranscriptionCard } from "@/components/transcription-card";
import { EmptyState } from "@/components/empty-state";
import { Plus, Search, ChevronDown } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
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

    const rawName = user!.email?.split("@")[0] ?? "Usuário";
    const firstName = rawName.split(/[.\-_]/)[0];
    const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

    return (
        <div>
            {/* ─── Boas-vindas ─────────────────────────────────────────── */}
            <section className="flex flex-col items-center px-2 pb-14 pt-16 text-center sm:pt-24">
                <h1 className="display-title text-[38px] text-foreground sm:text-[52px]">
                    Bem-vindo, {displayName}.
                </h1>
                <p className="mt-4 text-lg text-muted-foreground sm:text-xl">
                    O que você deseja fazer?
                </p>

                <div className="mt-10 flex flex-wrap justify-center gap-3">
                    <Link href="/dashboard/new" className="chip">
                        Nova degravação
                    </Link>
                    <Link href="#degravacoes" className="chip">
                        Minhas degravações
                    </Link>
                    {sharedTranscriptions.length > 0 && (
                        <Link href="#compartilhadas" className="chip">
                            Compartilhadas comigo
                        </Link>
                    )}
                </div>
            </section>

            {/* ─── Minhas degravações ──────────────────────────────────── */}
            <section id="degravacoes" className="scroll-mt-6">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground">
                            Degravações
                        </h2>
                        <p className="mt-1 text-[15px] text-muted-foreground">
                            Visualização geral de todas as transcrições.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative w-full sm:w-[260px]">
                            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input placeholder="Busca..." className="h-10 rounded-full pl-10" />
                        </div>
                        <button
                            type="button"
                            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                        >
                            Filtros
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </button>
                    </div>
                </div>

                {items.length === 0 ? (
                    <EmptyState
                        title="Nenhuma degravação"
                        description="Comece enviando um áudio ou vídeo de audiência."
                    >
                        <Link
                            href="/dashboard/new"
                            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                            <Plus className="h-4 w-4" />
                            Nova degravação
                        </Link>
                    </EmptyState>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {items.map((t) => (
                            <TranscriptionCard key={t.id} transcription={t} />
                        ))}
                    </div>
                )}
            </section>

            {/* ─── Compartilhadas Comigo ──────────────────────────────── */}
            {sharedTranscriptions.length > 0 && (
                <section id="compartilhadas" className="mt-14 scroll-mt-6">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold tracking-tight text-foreground">
                            Compartilhadas comigo
                        </h2>
                        <p className="mt-1 text-[15px] text-muted-foreground">
                            {sharedTranscriptions.length}{" "}
                            {sharedTranscriptions.length !== 1
                                ? "degravações recebidas"
                                : "degravação recebida"}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {sharedTranscriptions.map((t) => (
                            <TranscriptionCard key={`shared-${t.id}`} transcription={t} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
