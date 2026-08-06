import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { llmStream, type LLMMessage } from "@/lib/llm";

/**
 * POST /api/chat
 * Body: { messages: Array<{role: string, content: string}>, transcriptionId: string }
 *
 * Chat com o LLM configurado (Azure GPT-5.2 ou Google Gemini — ver
 * `LLM_PROVIDER` em `lib/llm.ts`) sobre o vídeo e a transcrição.
 * Retorna streaming de texto puro via ReadableStream.
 */
export async function POST(request: Request) {
    try {
        const { messages, transcriptionId } = await request.json();

        if (!transcriptionId || !messages) {
            return NextResponse.json(
                { error: "transcriptionId e messages são obrigatórios" },
                { status: 400 }
            );
        }

        const supabase = await createServerClient();

        // ── Auth guard ──────────────────────────────────────────────────────
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        }

        // Buscar utterances para contexto
        const { data: utterances } = await supabase
            .from("utterances")
            .select("speaker_label, text, start_time")
            .eq("transcription_id", transcriptionId)
            .order("sort_order", { ascending: true });

        const transcriptText = (utterances ?? [])
            .map((u: { speaker_label: string; text: string }) => `[${u.speaker_label}]: ${u.text}`)
            .join("\n");

        const systemPrompt = `Você é um assistente jurídico especializado em audiências judiciais brasileiras do TJMG.

Você tem acesso à transcrição completa de uma audiência judicial. Use-a para responder perguntas do usuário de forma precisa e contextualizada.

## Transcrição da Audiência
${transcriptText}

## Instruções
- Responda com base EXCLUSIVAMENTE no conteúdo da transcrição
- Se a informação não estiver na transcrição, diga explicitamente
- Use linguagem jurídica adequada mas acessível
- Cite trechos relevantes quando apropriado
- Seja objetivo e direto`;

        // O parser de SSE vive em `lib/llm.ts` e já entrega texto puro,
        // igual para Azure e Gemini — a rota não precisa saber a diferença.
        let stream: ReadableStream<Uint8Array>;
        try {
            stream = await llmStream({
                system: systemPrompt,
                messages: messages as LLMMessage[],
                maxTokens: 4000,
            });
        } catch (err) {
            console.error("Chat LLM error:", err);
            return NextResponse.json({ error: "Erro ao gerar resposta" }, { status: 500 });
        }

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
                "Transfer-Encoding": "chunked",
            },
        });
    } catch (err) {
        console.error("Chat route error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Erro interno" },
            { status: 500 }
        );
    }
}
