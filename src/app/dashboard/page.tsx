import { createServerClient } from "@/lib/supabase-server";
import { TranscriptionCard } from "@/components/transcription-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import type { Transcription } from "@/lib/types";

export default async function DashboardPage() {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Buscar degravações do usuário logado
    const { data: transcriptions, error } = await supabase
        .from("transcriptions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .returns<Transcription[]>();

    if (error) {
        console.error("Error fetching transcriptions:", error);
    }

    const items = transcriptions ?? [];

    return (
        <div>
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        Degravações
                    </h1>
                    <p className="mt-1 text-muted-foreground">
                        {items.length === 0
                            ? "Nenhuma degravação ainda"
                            : `${items.length} degravação${items.length !== 1 ? "ões" : ""}`}
                    </p>
                </div>

                <Link href="/dashboard/new">
                    <Button className="gradient-primary font-semibold text-white shadow-md">
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
                <div className="grid gap-4">
                    {items.map((t) => (
                        <TranscriptionCard key={t.id} transcription={t} />
                    ))}
                </div>
            )}
        </div>
    );
}
