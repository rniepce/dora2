import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * POST /api/summarize
 * Body: { transcriptionId: string }
 *
 * Gera um resumo da transcrição usando Azure GPT 5.2.
 */
export async function POST(request: Request) {
    try {
        const { transcriptionId } = await request.json();

        if (!transcriptionId) {
            return NextResponse.json({ error: "transcriptionId é obrigatório" }, { status: 400 });
        }

        const supabase = await createServerClient();

        // Buscar utterances
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

        const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
        const apiKey = process.env.AZURE_OPENAI_API_KEY!;
        const chatUrl = `${endpoint}/openai/deployments/gpt-5.2-chat/chat/completions?api-version=2025-01-01`;

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

        const llmRes = await fetch(chatUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": apiKey,
            },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Transcrição da audiência:\n\n${transcriptText}` },
                ],
                max_completion_tokens: 2000,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!llmRes.ok) {
            const errText = await llmRes.text();
            console.error("Summarize LLM error:", errText);
            return NextResponse.json({ error: "Erro ao gerar resumo" }, { status: 500 });
        }

        const llmData = await llmRes.json();
        const summary = llmData.choices?.[0]?.message?.content ?? "Não foi possível gerar o resumo.";

        return NextResponse.json({ summary });
    } catch (err) {
        console.error("Summarize route error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Erro interno" },
            { status: 500 }
        );
    }
}
