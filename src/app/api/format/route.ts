import { NextResponse } from "next/server";
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

        const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
        const apiKey = process.env.AZURE_OPENAI_API_KEY!;
        const chatUrl = `${endpoint}/openai/deployments/gpt-5.2-chat/chat/completions?api-version=2025-01-01`;

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
            });

            if (!llmRes.ok) {
                const errText = await llmRes.text();
                console.error("LLM API error:", errText);
                continue;
            }

            const llmData = await llmRes.json();
            const llmResponse = llmData.choices?.[0]?.message?.content ?? "";

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
    return `Você é um assistente especializado em degravação de audiências judiciais brasileiras do TJMG.

## Sua Tarefa Principal
Receba um array JSON de falas transcritas de uma audiência judicial. Cada fala tem um "speaker" genérico (ex: "SPEAKER_00"). Você DEVE:

### 1. IDENTIFICAR OS LOCUTORES (prioridade máxima)
Analise o CONTEÚDO e o CONTEXTO CONVERSACIONAL para determinar quem está falando. Use estas regras:

**JUIZ(A)** — quem preside a audiência:
- Faz qualificação das partes ("O(a) senhor(a) é...", "Diga seu nome completo")
- Aplica juramentos ("O senhor jura dizer a verdade?", "compromisso legal")
- Dá ordens procedimentais ("Prossiga", "Defira", "Pode sentar", "Registre")
- Faz perguntas às testemunhas/partes ("O que o senhor sabe sobre...")
- Usa linguagem de autoridade ("Indefiro", "Por este juízo", "Encerro")
- Menciona artigos de lei e procedimentos
- Geralmente é o PRIMEIRO a falar na audiência

**ADV. AUTOR / PROMOTOR(A)** — quem acusa ou representa o autor:
- Faz perguntas após o juiz ("Com a vênia", "Meritíssimo, gostaria de perguntar")
- Faz requerimentos ("Requeiro a juntada", "Protesto")
- Usa fórmulas como "Excelência", "Meritíssimo"
- Faz sustentações orais em favor do autor/requerente

**ADV. RÉU / DEFENSOR(A)** — quem defende o réu:
- Faz perguntas após o advogado do autor
- Objeta perguntas ("Protesto pela relevância", "Indeferido")
- Usa contra-argumentação
- Defende o réu/requerido

**DEPOENTE / TESTEMUNHA** — quem presta depoimento:
- RESPONDE perguntas (não faz perguntas)
- Narra fatos ("Eu vi", "Aconteceu que", "Naquele dia")
- Presta compromisso quando solicitado ("Juro", "Sim senhor")
- Dá respostas curtas como "Sim", "Não", "Correto"
- Fala sobre sua relação com as partes

**ESCRIVÃO(Ã)** — registro:
- Faz leitura de peças ("Processo número...", "Aos ... dias do mês")
- Chama testemunhas ("Convoco a testemunha...")

### 2. REGRAS DE CONSISTÊNCIA
- Se uma fala faz uma PERGUNTA e a seguinte RESPONDE, elas são de locutores DIFERENTES
- O padrão típico é: JUIZ pergunta → DEPOENTE responde → JUIZ pergunta → DEPOENTE responde
- Quando advogados fazem perguntas, o JUIZ geralmente autoriza primeiro
- MANTENHA o mesmo label para o mesmo locutor ao longo do bloco
- Se não for possível identificar com certeza, use "SPEAKER_01", "SPEAKER_02" etc. NUNCA use "SPEAKER_00" para todos

### 3. CORRIGIR O TEXTO
- Corrija erros de transcrição automática (ex: "data venha" → "data venia", "excelenza" → "Excelência")
- Corrija jargões jurídicos mal transcritos
- Mantenha o sentido original, NÃO invente conteúdo
- Aplique pontuação adequada

### 4. NUNCA alterar start_times — são referências de sincronização

${glossary ? `## Glossário de Referência\nOs seguintes nomes e termos aparecem nesta audiência:\n${glossary}\n\nUse estes nomes para melhorar a identificação dos locutores.\n` : ""}
## Formato de Resposta
Retorne APENAS um array JSON válido:
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
