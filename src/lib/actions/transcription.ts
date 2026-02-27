"use server";

import { createServerClient } from "@/lib/supabase-server";

interface CreateTranscriptionInput {
    title: string;
    glossary: string | null;
    engine: "whisper" | "deepgram";
}

export async function createTranscriptionAction(input: CreateTranscriptionInput) {
    const supabase = await createServerClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Não autenticado." };
    }

    const { data, error } = await supabase
        .from("transcriptions")
        .insert({
            user_id: user.id,
            title: input.title,
            glossary: input.glossary || null,
            engine: input.engine,
            status: "uploading",
        })
        .select("id")
        .single();

    if (error) {
        console.error("Error creating transcription:", error);
        return { error: "Erro ao criar degravação." };
    }

    return { id: data.id };
}

export async function updateTranscriptionMediaUrl(id: string, mediaUrl: string) {
    const supabase = await createServerClient();

    const { error } = await supabase
        .from("transcriptions")
        .update({
            media_url: mediaUrl,
            status: "transcribing",
            updated_at: new Date().toISOString(),
        })
        .eq("id", id);

    if (error) {
        console.error("Error updating transcription:", error);
        return { error: "Erro ao atualizar degravação." };
    }

    return { success: true };
}

export async function updateTranscriptionStatus(
    id: string,
    status: "uploading" | "transcribing" | "formatting" | "completed" | "error"
) {
    const supabase = await createServerClient();

    const { error } = await supabase
        .from("transcriptions")
        .update({
            status,
            updated_at: new Date().toISOString(),
        })
        .eq("id", id);

    if (error) {
        console.error("Error updating transcription status:", error);
        return { error: "Erro ao atualizar status." };
    }

    return { success: true };
}

export async function deleteTranscriptionAction(id: string) {
    const supabase = await createServerClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Não autenticado." };
    }

    // Buscar a transcrição primeiro para obter media_url
    const { data: transcription } = await supabase
        .from("transcriptions")
        .select("media_url")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

    // Deletar utterances primeiro (FK constraint)
    const { error: uttError } = await supabase
        .from("utterances")
        .delete()
        .eq("transcription_id", id);

    if (uttError) {
        console.error("Error deleting utterances:", uttError);
        // Continuar mesmo se falhar — pode não ter utterances
    }

    // Deletar a transcrição
    const { error } = await supabase
        .from("transcriptions")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error deleting transcription:", error);
        return { error: "Erro ao apagar degravação." };
    }

    // Limpar arquivo de mídia do Storage (se existir)
    if (transcription?.media_url) {
        try {
            const url = new URL(transcription.media_url);
            const pathMatch = url.pathname.match(/\/storage\/v1\/object\/[^/]+\/media\/(.+)/);
            if (pathMatch) {
                await supabase.storage.from("media").remove([pathMatch[1]]);
            }
        } catch {
            // Ignorar erro de limpeza de storage — a transcrição já foi deletada
        }
    }

    // Revalidar a página do dashboard para atualizar o cache do Next.js
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard");

    return { success: true };
}
