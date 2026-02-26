"use server";

import { createServerClient } from "@/lib/supabase-server";

interface CreateTranscriptionInput {
    title: string;
    glossary: string | null;
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
