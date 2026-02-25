import { NextResponse } from "next/server";

/**
 * POST /api/process
 * Body: { transcriptionId: string }
 *
 * Orquestra o pipeline completo:
 * 1. Chama /api/transcribe (Deepgram)
 * 2. Chama /api/format (LLM)
 *
 * O upload page chama esta rota após o upload do áudio para Storage.
 */
export async function POST(request: Request) {
    try {
        const { transcriptionId } = await request.json();

        if (!transcriptionId) {
            return NextResponse.json({ error: "transcriptionId é obrigatório" }, { status: 400 });
        }

        const origin = new URL(request.url).origin;

        // 1. Transcrição com Deepgram
        const transcribeRes = await fetch(`${origin}/api/transcribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcriptionId }),
        });

        if (!transcribeRes.ok) {
            const err = await transcribeRes.json();
            return NextResponse.json(
                { error: `Transcrição falhou: ${err.error}`, step: "transcribe" },
                { status: 500 }
            );
        }

        const transcribeData = await transcribeRes.json();

        // 2. Formatação com LLM
        const formatRes = await fetch(`${origin}/api/format`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcriptionId }),
        });

        if (!formatRes.ok) {
            const err = await formatRes.json();
            return NextResponse.json(
                { error: `Formatação falhou: ${err.error}`, step: "format" },
                { status: 500 }
            );
        }

        const formatData = await formatRes.json();

        return NextResponse.json({
            success: true,
            transcribe: transcribeData,
            format: formatData,
        });
    } catch (err) {
        console.error("Process pipeline error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Erro interno no pipeline" },
            { status: 500 }
        );
    }
}
