import { NextResponse } from "next/server";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import { createServerClient } from "@/lib/supabase-server";

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
    try {
        const { transcriptionId } = await request.json();

        if (!transcriptionId) {
            return NextResponse.json({ error: "transcriptionId é obrigatório" }, { status: 400 });
        }

        const supabase = await createServerClient();

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

        const azure = createAzure({
            baseURL: `${process.env.AZURE_OPENAI_ENDPOINT!}/openai/deployments`,
            apiKey: process.env.AZURE_OPENAI_API_KEY!,
        });

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

            const { text: llmResponse } = await generateText({
                model: azure("gpt-5.2-chat"),
                system: systemPrompt,
                prompt: userPrompt,
                temperature: 0.2,
                maxOutputTokens: 8000,
            });

            // Parsear a resposta do LLM
            const parsed = parseLLMResponse(llmResponse);
            if (parsed) {
                allUpdates.push(...parsed);
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

        return NextResponse.json({
            success: true,
            updatedCount: allUpdates.length,
        });
    } catch (err) {
        console.error("Format route error:", err);

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

// ─── System Prompt Jurídico ──────────────────────────────────────────────────
function buildSystemPrompt(glossary: string): string {
    return `Você é um assistente especializado em degravação de audiências judiciais brasileiras.

## Sua Tarefa
Receba um array JSON de falas diarizadas de uma audiência judicial. Para cada fala:

1. **Identifique o papel** do locutor pelo conteúdo do diálogo:
   - Quem conduz a audiência, faz perguntas e dá ordens é o "JUIZ(A)"
   - Quem representa o autor/requerente é "ADV. AUTOR" ou "PROMOTOR(A)"
   - Quem representa o réu/requerido é "ADV. RÉU" ou "DEFENSOR(A)"
   - Quem presta depoimento é "DEPOENTE", "TESTEMUNHA", "RÉU" ou "AUTOR"
   - Quem faz registro é "ESCRIVÃO(Ã)"
   - Se não for possível identificar, mantenha o label original

2. **Corrija o texto**:
   - Corrija erros de transcrição automática (ex: "data venha" → "data venia")
   - Corrija jargões jurídicos mal transcritos
   - Mantenha o sentido original, NÃO invente conteúdo
   - Aplique pontuação adequada

3. **NUNCA altere os start_times originais** — eles são referências de sincronização

${glossary ? `## Glossário de Referência\n${glossary}\n` : ""}

## Formato de Resposta
Retorne APENAS um array JSON válido com esta estrutura:
\`\`\`json
[
  {
    "id": "uuid-original",
    "speaker_label": "JUIZ(A)",
    "text": "Texto corrigido e formatado"
  }
]
\`\`\`

IMPORTANTE: Retorne APENAS o JSON, sem markdown, sem explicações, sem texto antes ou depois.`;
}

// ─── Parser da resposta do LLM ──────────────────────────────────────────────
function parseLLMResponse(
    response: string
): Array<{ id: string; speaker_label: string; text: string }> | null {
    try {
        // Tentar parsear diretamente
        const parsed = JSON.parse(response);
        if (Array.isArray(parsed)) return parsed;

        // Tentar extrair JSON de dentro de markdown code blocks
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch?.[1]) {
            const inner = JSON.parse(jsonMatch[1].trim());
            if (Array.isArray(inner)) return inner;
        }

        // Tentar encontrar o array no texto
        const arrayMatch = response.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            const arr = JSON.parse(arrayMatch[0]);
            if (Array.isArray(arr)) return arr;
        }

        console.error("Could not parse LLM response as array");
        return null;
    } catch (err) {
        console.error("LLM response parse error:", err);
        console.error("Raw response:", response.substring(0, 500));
        return null;
    }
}
