import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { buildSystemPrompt, parseLLMResponse } from "@/lib/format-llm";

/**
 * POST /api/format
 * Body: { transcriptionId: string }
 *
 * 1. Busca as utterances da degravação
 * 2. Envia blocos para o LLM (Azure gpt-4.1-mini) com system prompt jurídico
 * 3. Atualiza os speaker_labels e textos corrigidos
 * 4. Atualiza o status para "completed"
 */
export async function POST(request: Request) {
    const requestId = crypto.randomUUID();

    try {
        const { transcriptionId } = await request.json();

        if (!transcriptionId) {
            return NextResponse.json({ error: "transcriptionId é obrigatório" }, { status: 400 });
        }

        const supabase = await createServerClient();

        // ── Auth guard ──────────────────────────────────────────────────────
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        }

        console.log(`[Format] [${requestId}] transcriptionId=${transcriptionId} user=${user.id}`);

        // 1. Buscar utterances
        const { data: utterances, error: fetchError } = await supabase
            .from("utterances")
            .select("*")
            .eq("transcription_id", transcriptionId)
            .order("sort_order", { ascending: true });

        if (fetchError || !utterances || utterances.length === 0) {
            return NextResponse.json({ error: "Nenhuma fala encontrada" }, { status: 404 });
        }

        // Buscar glossário da degravação
        const { data: transcription } = await supabase
            .from("transcriptions")
            .select("glossary")
            .eq("id", transcriptionId)
            .single();

        const glossary = transcription?.glossary ?? "";

        // 2. Preparar o input para o LLM
        const utterancesForLLM = utterances.map((u: {
            id: string;
            speaker_label: string;
            text: string;
            start_time: number;
        }) => ({
            id: u.id,
            speaker: u.speaker_label,
            text: u.text,
            start_time: u.start_time,
        }));

        // Processar em blocos de no máximo 40 utterances para evitar timeout
        const BATCH_SIZE = 40;
        const batches: typeof utterancesForLLM[] = [];
        for (let i = 0; i < utterancesForLLM.length; i += BATCH_SIZE) {
            batches.push(utterancesForLLM.slice(i, i + BATCH_SIZE));
        }

        const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
        const apiKey = process.env.AZURE_OPENAI_API_KEY!;
        const chatUrl = `${endpoint}/openai/deployments/gpt-5.2-chat/chat/completions?api-version=2024-06-01`;

        // Helper para atualizar progresso
        const updateProgress = async (progress: number, status?: string) => {
            const update: Record<string, unknown> = { progress, updated_at: new Date().toISOString() };
            if (status) update.status = status;
            await supabase.from("transcriptions").update(update).eq("id", transcriptionId);
        };

        await updateProgress(70);
        const allUpdates: Array<{ id: string; speaker_label: string; text: string }> = [];

        for (const batch of batches) {
            const systemPrompt = buildSystemPrompt(glossary);
            const userPrompt = JSON.stringify(batch, null, 2);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min por batch

            try {
                const llmRes = await fetch(chatUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "api-key": apiKey,
                    },
                    body: JSON.stringify({
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userPrompt },
                        ],
                        max_completion_tokens: 8000,
                    }),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!llmRes.ok) {
                    const errText = await llmRes.text();
                    console.error(`[Format] [${requestId}] LLM API error:`, errText);
                    continue;
                }

                const llmData = await llmRes.json();
                const llmResponse = llmData.choices?.[0]?.message?.content ?? "";

                const parsed = parseLLMResponse(llmResponse);
                if (parsed) {
                    allUpdates.push(...parsed);
                }
            } catch (batchErr) {
                clearTimeout(timeoutId);
                if (batchErr instanceof Error && batchErr.name === "AbortError") {
                    console.error(`[Format] [${requestId}] LLM batch timeout`);
                } else {
                    console.error(`[Format] [${requestId}] LLM batch error:`, batchErr);
                }
                continue;
            }

            // Atualizar progresso por batch (70-90%)
            const batchProgress = 70 + Math.round((batches.indexOf(batch) + 1) / batches.length * 20);
            await updateProgress(batchProgress);
        }

        // 3. Atualizar utterances no banco
        for (const update of allUpdates) {
            await supabase
                .from("utterances")
                .update({
                    speaker_label: update.speaker_label,
                    text: update.text,
                })
                .eq("id", update.id);
        }

        // 4. Atualizar status para completed
        await updateProgress(100, "completed");

        console.log(`[Format] [${requestId}] Done — updatedCount=${allUpdates.length}`);

        return NextResponse.json({
            success: true,
            updatedCount: allUpdates.length,
        });
    } catch (err) {
        console.error(`[Format] [${requestId}] Error:`, err);

        // Tentar atualizar status para error
        try {
            const { transcriptionId } = await request.clone().json();
            if (transcriptionId) {
                const supabase = await createServerClient();
                await supabase
                    .from("transcriptions")
                    .update({ status: "error", updated_at: new Date().toISOString() })
                    .eq("id", transcriptionId);
            }
        } catch { /* ignore */ }

        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Erro interno" },
            { status: 500 }
        );
    }
}
