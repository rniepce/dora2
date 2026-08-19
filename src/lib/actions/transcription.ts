"use server";

import { createServerClient } from "@/lib/supabase-server";

interface CreateTranscriptionInput {
    title: string;
    glossary: string | null;
    engine: "whisper" | "deepgram" | "google" | "aws";
}

export async function createTranscriptionAction(input: CreateTranscriptionInput) {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from("transcriptions")
        .insert({
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
        .eq("id", id);

    if (error) {
        console.error("Error deleting transcription:", error);
        return { error: "Erro ao apagar degravação." };
    }

    // Limpar arquivos de mídia do Storage.
    //
    // Listamos a pasta da degravação em vez de derivar o caminho do media_url:
    // quando o upload falha no meio, o arquivo já está no bucket mas media_url
    // continua nulo, e o arquivo ficava órfão para sempre ocupando a cota.
    try {
        const { data: arquivos, error: listError } = await supabase.storage
            .from("media")
            .list(id);

        if (listError) {
            console.error("Error listing media files:", listError);
        } else if (arquivos && arquivos.length > 0) {
            const caminhos = arquivos.map((arquivo) => `${id}/${arquivo.name}`);
            const { error: removeError } = await supabase.storage
                .from("media")
                .remove(caminhos);

            if (removeError) {
                console.error("Error removing media files:", removeError);
            }
        }
    } catch (err) {
        // A degravação já saiu do banco; falha na limpeza não deve virar erro
        // para o usuário — só fica registrada para investigação.
        console.error("Storage cleanup failed:", err);
    }

    // Revalidar a página do dashboard para atualizar o cache do Next.js
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard");

    return { success: true };
}
