import { createServerClient } from "@/lib/supabase-server";
import { TranscriptionCard } from "@/components/transcription-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import type { Transcription } from "@/lib/types";

export default async function DashboardPage() {
    const supabase = await createServerClient();

    const { data: transcriptions, error } = await supabase
        .from("transcriptions")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<Transcription[]>();

    if (error) {
        console.error("Error fetching transcriptions:", error);
    }

    const items = transcriptions ?? [];

    return (
        <div>
            {/* Page header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    Minhas Degravações
                </h1>
                <p className="mt-1 text-muted-foreground">
                    {items.length > 0
                        ? `${items.length} degravação${items.length > 1 ? "ões" : ""} encontrada${items.length > 1 ? "s" : ""}`
                        : "Gerencie suas transcrições de audiências judiciais"}
                </p>
            </div>

            {/* Transcription list or empty state */}
            {items.length === 0 ? (
                <EmptyState>
                    <Link href="/dashboard/new">
                        <Button className="gradient-primary font-semibold text-primary-foreground shadow-md shadow-primary/20">
                            <Plus className="mr-1.5 h-4 w-4" />
                            Nova Degravação
                        </Button>
                    </Link>
                </EmptyState>
            ) : (
                <div className="space-y-3">
                    {items.map((transcription) => (
                        <TranscriptionCard
                            key={transcription.id}
                            transcription={transcription}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
