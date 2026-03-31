import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import { EditorClient } from "@/components/editor-client";
import { ErrorBoundary } from "@/components/error-boundary";
import type { Transcription, Utterance } from "@/lib/types";

interface EditorPageProps {
    params: Promise<{ id: string }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
    const { id } = await params;
    const supabase = await createServerClient();

    // Buscar a degravação
    const { data: transcription, error: tError } = await supabase
        .from("transcriptions")
        .select("*")
        .eq("id", id)
        .single<Transcription>();

    if (tError || !transcription) {
        notFound();
    }

    // Buscar as utterances
    const { data: utterances } = await supabase
        .from("utterances")
        .select("*")
        .eq("transcription_id", id)
        .order("sort_order", { ascending: true })
        .returns<Utterance[]>();

    return (
        <ErrorBoundary fallbackMessage="Erro ao carregar o editor">
            <EditorClient
                transcription={transcription}
                utterances={utterances ?? []}
            />
        </ErrorBoundary>
    );
}
