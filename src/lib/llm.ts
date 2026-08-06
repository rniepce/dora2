/**
 * Camada de abstração de LLM — permite trocar o provedor sem tocar nas rotas.
 *
 * Provedores suportados:
 *   - "azure"  → Azure OpenAI (gpt-5.2-chat)        [padrão, comportamento atual]
 *   - "gemini" → Google Gemini (gemini-3.6-flash)   [com fallback p/ gemini-3.5-flash]
 *
 * Selecionado pela env `LLM_PROVIDER`. Ausente = "azure" (retrocompatível).
 *
 * Espelha o padrão já usado na transcrição (whisper/deepgram/google em
 * `api/process/route.ts`), mas aqui a escolha é por ambiente, não por job.
 */

export type LLMProvider = "azure" | "gemini";

export interface LLMMessage {
    role: "user" | "assistant";
    content: string;
}

export interface LLMRequest {
    /** Instrução de sistema (persona + regras). */
    system: string;
    /** Histórico da conversa. Para one-shot, passe um único item `user`. */
    messages: LLMMessage[];
    /** Teto de tokens de saída. */
    maxTokens: number;
    /** Aborta a requisição (usado pelo timeout do /api/summarize). */
    signal?: AbortSignal;
}

// ─── Seleção de provedor ─────────────────────────────────────────────────────

export function getProvider(): LLMProvider {
    return process.env.LLM_PROVIDER === "gemini" ? "gemini" : "azure";
}

/** Rótulo legível para logs e para a UI. */
export function getProviderLabel(): string {
    return getProvider() === "gemini"
        ? `Google ${geminiModels()[0]}`
        : "Azure GPT-5.2";
}

/**
 * Ordem de tentativa dos modelos Gemini: o preferido primeiro, o fallback depois.
 * `GEMINI_MODEL` permite fixar um modelo específico sem alterar código.
 */
function geminiModels(): string[] {
    const preferred = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
    const fallback = process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-3.5-flash";
    return preferred === fallback ? [preferred] : [preferred, fallback];
}

// ─── Política de fallback entre modelos ──────────────────────────────────────

/**
 * Decide se, após uma falha do modelo preferido, vale a pena tentar o próximo
 * modelo da lista (ex.: gemini-3.6-flash → gemini-3.5-flash).
 *
 * @param status   HTTP status devolvido pela API do Gemini
 * @param body     corpo do erro (texto cru), útil p/ inspecionar `error.status`
 * @returns        true = tenta o próximo modelo; false = propaga o erro
 *
 * TODO(você): definir a política definitiva. Trade-offs a considerar:
 *
 *   • 404 / "NOT_FOUND" → o modelo não existe nessa chave/região. Fallback é
 *     claramente certo: sem ele o app quebra em contas sem acesso ao 3.6.
 *   • 429 (rate limit) e 503 (overloaded) → o 3.6 está saturado. Cair para o
 *     3.5 mantém o serviço de pé, mas troca silenciosamente a qualidade do
 *     modelo — num contexto jurídico (identificação de locutores em audiência)
 *     isso pode ser indesejável sem registro explícito.
 *   • 400 (bad request) e 401/403 (auth) → o segundo modelo vai falhar igual.
 *     Tentar de novo só dobra a latência de um erro certo.
 *
 * Comportamento atual = permissivo (tenta sempre). Ajuste conforme sua política.
 */
function shouldFallbackToNextModel(status: number, body: string): boolean {
    void status;
    void body;
    return true;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/** Chamada não-streaming. Retorna o texto gerado. */
export async function llmComplete(req: LLMRequest): Promise<string> {
    return getProvider() === "gemini" ? geminiComplete(req) : azureComplete(req);
}

/**
 * Chamada streaming. Retorna um stream de **texto puro UTF-8** (já
 * des-encapsulado do SSE), idêntico para os dois provedores — por isso
 * `api/chat/route.ts` e o `chat-panel.tsx` não precisam saber quem respondeu.
 */
export async function llmStream(req: LLMRequest): Promise<ReadableStream<Uint8Array>> {
    return getProvider() === "gemini" ? geminiStream(req) : azureStream(req);
}

// ─── Azure OpenAI ────────────────────────────────────────────────────────────

function azureUrl(): string {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    if (!endpoint) throw new Error("AZURE_OPENAI_ENDPOINT não configurada");
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT?.trim() || "gpt-5.2-chat";
    return `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-06-01`;
}

function azureBody(req: LLMRequest, stream: boolean) {
    return JSON.stringify({
        messages: [
            { role: "system", content: req.system },
            ...req.messages,
        ],
        max_completion_tokens: req.maxTokens,
        ...(stream ? { stream: true } : {}),
    });
}

async function azureFetch(req: LLMRequest, stream: boolean): Promise<Response> {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    if (!apiKey) throw new Error("AZURE_OPENAI_API_KEY não configurada");

    const res = await fetch(azureUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body: azureBody(req, stream),
        signal: req.signal,
    });

    if (!res.ok) {
        const errText = await res.text();
        console.error("[LLM/azure] API error:", res.status, errText.substring(0, 500));
        throw new Error(`Azure OpenAI ${res.status}: ${errText.substring(0, 300)}`);
    }
    return res;
}

async function azureComplete(req: LLMRequest): Promise<string> {
    const res = await azureFetch(req, false);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
}

async function azureStream(req: LLMRequest): Promise<ReadableStream<Uint8Array>> {
    const res = await azureFetch(req, true);
    // Azure/OpenAI entrega o delta em `choices[0].delta.content`
    return sseToText(res, (json) => {
        const content = json.choices?.[0]?.delta?.content;
        return typeof content === "string" ? content : "";
    });
}

// ─── Google Gemini ───────────────────────────────────────────────────────────

function geminiApiKey(): string {
    // Aceita a chave dedicada do Gemini ou reaproveita a do Google Cloud
    // (a mesma já usada pelo Chirp 3 em `transcribe-google.ts`), desde que a
    // API "Generative Language" esteja habilitada no projeto.
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY não configurada");
    return key;
}

function geminiBody(req: LLMRequest): string {
    return JSON.stringify({
        // Gemini separa a instrução de sistema do histórico — não existe
        // `role: "system"` dentro de `contents`.
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({
            // "assistant" (OpenAI) ≡ "model" (Gemini)
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: req.maxTokens },
    });
}

/**
 * Tenta cada modelo da lista em ordem, consultando `shouldFallbackToNextModel`
 * antes de desistir do atual.
 */
async function geminiFetch(req: LLMRequest, stream: boolean): Promise<Response> {
    const key = geminiApiKey();
    const models = geminiModels();
    const method = stream ? "streamGenerateContent?alt=sse&" : "generateContent?";
    let lastError = "";

    for (let i = 0; i < models.length; i++) {
        const model = models[i];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}key=${key}`;

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: geminiBody(req),
            signal: req.signal,
        });

        if (res.ok) {
            if (i > 0) console.warn(`[LLM/gemini] usando fallback: ${model}`);
            return res;
        }

        lastError = await res.text();
        console.error(`[LLM/gemini] ${model} → ${res.status}:`, lastError.substring(0, 500));

        const isLast = i === models.length - 1;
        if (isLast || !shouldFallbackToNextModel(res.status, lastError)) {
            throw new Error(`Gemini ${res.status}: ${lastError.substring(0, 300)}`);
        }
    }

    throw new Error(`Gemini indisponível: ${lastError.substring(0, 300)}`);
}

async function geminiComplete(req: LLMRequest): Promise<string> {
    const res = await geminiFetch(req, false);
    const data = await res.json();
    // Gemini pode devolver a resposta fatiada em várias `parts` — concatenar.
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p: { text?: string }) => p.text ?? "").join("");
}

async function geminiStream(req: LLMRequest): Promise<ReadableStream<Uint8Array>> {
    const res = await geminiFetch(req, true);
    return sseToText(res, (json) => {
        const parts = json.candidates?.[0]?.content?.parts ?? [];
        return parts.map((p: { text?: string }) => p.text ?? "").join("");
    });
}

// ─── SSE → texto puro ────────────────────────────────────────────────────────

/** Formato dos chunks SSE dos dois provedores. */
interface SsePayload {
    /** Azure/OpenAI */
    choices?: Array<{ delta?: { content?: string } }>;
    /** Gemini */
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Converte um corpo SSE (`data: {...}\n\n`) num stream de texto puro,
 * aplicando `extract` a cada chunk JSON para pegar o pedaço de texto.
 *
 * Ambos os provedores falam SSE; só a forma do JSON muda. Isolar isso aqui
 * evita duplicar o parser de buffer/linhas em cada rota.
 */
function sseToText(
    res: Response,
    extract: (json: SsePayload) => string
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    return new ReadableStream({
        async start(controller) {
            const reader = res.body?.getReader();
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
                    // A última linha pode estar incompleta — guarda p/ o próximo chunk
                    buffer = lines.pop() ?? "";

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed === "data: [DONE]") continue;
                        if (!trimmed.startsWith("data: ")) continue;

                        try {
                            const text = extract(JSON.parse(trimmed.slice(6)));
                            if (text) controller.enqueue(encoder.encode(text));
                        } catch {
                            // Chunk malformado — ignora e segue
                        }
                    }
                }
            } catch (err) {
                console.error("[LLM] Stream error:", err);
            } finally {
                controller.close();
            }
        },
    });
}
