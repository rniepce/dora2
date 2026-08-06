import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { llmComplete } from "@/lib/llm";

/**
 * POST /api/summarize
 * Body: { transcriptionId: string, force?: boolean }
 *
 * Retorna o resumo salvo ou gera um novo usando o LLM configurado
 * (Azure GPT-5.2 ou Google Gemini — ver `LLM_PROVIDER` em `lib/llm.ts`).
 * Quando `force: true`, sempre regenera via LLM e sobrescreve o cache.
 */
export async function POST(request: Request) {
    try {
        const { transcriptionId, force } = await request.json();

        if (!transcriptionId) {
            return NextResponse.json({ error: "transcriptionId é obrigatório" }, { status: 400 });
        }

        const supabase = await createServerClient();

        // ── Auth guard ──────────────────────────────────────────────────────
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        }

        // ── 1. Verificar se já existe resumo salvo ──────────────────────────
        if (!force) {
            const { data: transcription } = await supabase
                .from("transcriptions")
                .select("summary")
                .eq("id", transcriptionId)
                .single();

            if (transcription?.summary) {
                return NextResponse.json({ summary: transcription.summary });
            }
        }

        // ── 2. Buscar utterances para gerar o resumo ────────────────────────
        const { data: utterances, error: fetchError } = await supabase
            .from("utterances")
            .select("speaker_label, text, start_time")
            .eq("transcription_id", transcriptionId)
            .order("sort_order", { ascending: true });

        if (fetchError || !utterances || utterances.length === 0) {
            return NextResponse.json({ error: "Nenhuma fala encontrada" }, { status: 404 });
        }

        // Montar texto da transcrição (truncar se muito longo para evitar timeout)
        let transcriptText = utterances
            .map((u: { speaker_label: string; text: string }) => `[${u.speaker_label}]: ${u.text}`)
            .join("\n");

        const MAX_CHARS = 12000;
        if (transcriptText.length > MAX_CHARS) {
            console.log(`[Summarize] Truncating transcript from ${transcriptText.length} to ${MAX_CHARS} chars`);
            transcriptText = transcriptText.substring(0, MAX_CHARS) + "\n\n[... transcrição truncada para resumo ...]";
        }

        // ── 3. Chamar o LLM ────────────────────────────────────────────────
        const systemPrompt = `Você é um assistente jurídico especializado em audiências judiciais brasileiras do TJMG.

Analise a transcrição abaixo de uma audiência judicial e produza um resumo estruturado contendo:

1. **Tipo da audiência** (instrução, conciliação, julgamento, etc.)
2. **Partes envolvidas** (juiz, advogados, réu, autor, testemunhas)
3. **Principais pontos discutidos**
4. **Decisões ou encaminhamentos tomados**
5. **Depoimentos relevantes** (resumo dos pontos-chave)

Seja objetivo e direto. Use linguagem jurídica adequada, mas acessível. O resumo deve ter no máximo 500 palavras.`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        let summary: string;
        try {
            summary = await llmComplete({
                system: systemPrompt,
                messages: [
                    { role: "user", content: `Transcrição da audiência:\n\n${transcriptText}` },
                ],
                maxTokens: 2000,
                signal: controller.signal,
            });
        } catch (err) {
            console.error("Summarize LLM error:", err);
            return NextResponse.json({ error: "Erro ao gerar resumo" }, { status: 500 });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!summary) summary = "Não foi possível gerar o resumo.";

        // ── 4. Salvar o resumo no banco ─────────────────────────────────────
        const { error: updateError } = await supabase
            .from("transcriptions")
            .update({ summary })
            .eq("id", transcriptionId);

        if (updateError) {
            console.error("Failed to persist summary:", updateError);
            // Não bloqueia — retorna o resumo mesmo sem salvar
        }

        return NextResponse.json({ summary });
    } catch (err) {
        console.error("Summarize route error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Erro interno" },
            { status: 500 }
        );
    }
}
