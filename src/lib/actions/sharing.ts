"use server";

import { createServerClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

// ─── Compartilhar degravação por email ──────────────────────────────────────
export async function shareTranscriptionAction(
    transcriptionId: string,
    email: string
) {
    const supabase = await createServerClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Não autenticado." };
    }

    // Verificar que a transcrição pertence ao usuário
    const { data: transcription } = await supabase
        .from("transcriptions")
        .select("id, user_id")
        .eq("id", transcriptionId)
        .eq("user_id", user.id)
        .single();

    if (!transcription) {
        return { error: "Degravação não encontrada ou não pertence a você." };
    }

    // Não permitir compartilhar consigo mesmo
    if (email.toLowerCase() === user.email?.toLowerCase()) {
        return { error: "Você não pode compartilhar consigo mesmo." };
    }

    // Buscar o usuário pelo email usando a tabela auth.users via RPC
    // Como não temos acesso direto ao auth.users pelo client, usamos uma busca
    // pela view de profiles ou pela API admin. Aqui usamos um approach seguro:
    // buscamos via admin API ou, se não disponível, via uma function RPC.
    //
    // Alternativa: buscar pelo email nos shared existentes + tentativa de insert
    // com a constraint para pegar o erro.
    //
    // Para máxima compatibilidade, vamos usar a Supabase Admin API via service role
    // se disponível, ou fazer uma busca na tabela auth.users via RPC.

    // Tentar buscar o user_id pelo email usando a view de auth
    const { data: targetUsers, error: lookupError } = await supabase
        .rpc("get_user_id_by_email", { target_email: email.toLowerCase() });

    if (lookupError || !targetUsers || targetUsers.length === 0) {
        // Fallback: tentar buscar de outra forma ou retornar erro amigável
        return {
            error: `Nenhum usuário encontrado com o email "${email}". O usuário precisa ter uma conta no sistema.`,
        };
    }

    const targetUserId = targetUsers[0].id;

    // Inserir compartilhamento
    const { error: insertError } = await supabase
        .from("shared_transcriptions")
        .insert({
            transcription_id: transcriptionId,
            shared_by: user.id,
            shared_with: targetUserId,
        });

    if (insertError) {
        if (insertError.code === "23505") {
            // unique constraint violation
            return { error: "Esta degravação já foi compartilhada com este usuário." };
        }
        console.error("Error sharing transcription:", insertError);
        return { error: "Erro ao compartilhar degravação." };
    }

    revalidatePath("/dashboard");
    return { success: true };
}

// ─── Remover compartilhamento ───────────────────────────────────────────────
export async function unshareTranscriptionAction(
    transcriptionId: string,
    sharedWithId: string
) {
    const supabase = await createServerClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Não autenticado." };
    }

    const { error } = await supabase
        .from("shared_transcriptions")
        .delete()
        .eq("transcription_id", transcriptionId)
        .eq("shared_by", user.id)
        .eq("shared_with", sharedWithId);

    if (error) {
        console.error("Error unsharing transcription:", error);
        return { error: "Erro ao remover compartilhamento." };
    }

    revalidatePath("/dashboard");
    return { success: true };
}

// ─── Listar compartilhamentos de uma degravação ─────────────────────────────
export async function getSharesAction(transcriptionId: string) {
    const supabase = await createServerClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Não autenticado.", shares: [] };
    }

    const { data: shares, error } = await supabase
        .from("shared_transcriptions")
        .select("id, shared_with, created_at")
        .eq("transcription_id", transcriptionId)
        .eq("shared_by", user.id)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching shares:", error);
        return { error: "Erro ao buscar compartilhamentos.", shares: [] };
    }

    // Buscar emails dos usuários compartilhados
    if (shares && shares.length > 0) {
        const userIds = shares.map((s) => s.shared_with);
        const { data: users } = await supabase
            .rpc("get_user_emails_by_ids", { user_ids: userIds });

        const emailMap: Record<string, string> = {};
        if (users) {
            for (const u of users) {
                emailMap[u.id] = u.email;
            }
        }

        return {
            shares: shares.map((s) => ({
                id: s.id,
                shared_with_id: s.shared_with,
                shared_with_email: emailMap[s.shared_with] ?? "Desconhecido",
                created_at: s.created_at,
            })),
        };
    }

    return { shares: [] };
}
