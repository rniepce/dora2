import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * POST /api/chat
 * Body: { messages: Array<{role: string, content: string}>, transcriptionId: string }
 *
 * Chat com o LLM sobre o vídeo e a transcrição.
 * Retorna streaming de texto via ReadableStream.
 */
export async function POST(request: Request) {
    const requestId = crypto.randomUUID();

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

        console.log(`[Chat] [${requestId}] transcriptionId=${transcriptionId} user=${user.id}`);

        // Buscar utterances para contexto
        const { data: utterances } = await supabase
            .from("utterances")
            .select("speaker_label, text, start_time")
            .eq("transcription_id", transcriptionId)
            .order("sort_order", { ascending: true });

        const transcriptText = (utterances ?? [])
            .map((u: { speaker_label: string; text: string }) => `[${u.speaker_label}]: ${u.text}`)
            .join("\n");

        const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
        const apiKey = process.env.AZURE_OPENAI_API_KEY!;
        const chatUrl = `${endpoint}/openai/deployments/gpt-5.2-chat/chat/completions?api-version=2024-06-01`;

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

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min timeout

        let llmRes: Response;
        try {
            llmRes = await fetch(chatUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": apiKey,
                },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...messages,
                    ],
                    max_completion_tokens: 4000,
                    stream: true,
                }),
                signal: controller.signal,
            });
        } catch (fetchErr) {
            clearTimeout(timeoutId);
            if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
                console.error(`[Chat] [${requestId}] LLM timeout`);
                return NextResponse.json({ error: "Timeout ao gerar resposta" }, { status: 504 });
            }
            throw fetchErr;
        }

        clearTimeout(timeoutId);

        if (!llmRes.ok) {
            const errText = await llmRes.text();
            console.error(`[Chat] [${requestId}] LLM error:`, errText);
            return NextResponse.json({ error: "Erro ao gerar resposta" }, { status: 500 });
        }

        // Stream the response
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
            async start(controller) {
                const reader = llmRes.body?.getReader();
                if (!reader) {
                    controller.close();
                    return;
                }

                let buffer = "";

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");
                        buffer = lines.pop() ?? "";

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed || trimmed === "data: [DONE]") continue;
                            if (!trimmed.startsWith("data: ")) continue;

                            try {
                                const json = JSON.parse(trimmed.slice(6));
                                const content = json.choices?.[0]?.delta?.content;
                                if (content) {
                                    controller.enqueue(encoder.encode(content));
                                }
                            } catch {
                                // Skip malformed chunks
                            }
                        }
                    }
                } catch (err) {
                    console.error(`[Chat] [${requestId}] Stream error:`, err);
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
                "Transfer-Encoding": "chunked",
            },
        });
    } catch (err) {
        console.error(`[Chat] [${requestId}] Error:`, err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Erro interno" },
            { status: 500 }
        );
    }
}
