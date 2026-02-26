import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { runWhisperTranscription } from "@/lib/transcribe-whisper";
import { runDeepgramTranscription } from "@/lib/transcribe-deepgram";
import { runFormatting } from "@/lib/format-llm";

// Railway/Vercel: permitir até 5 minutos de processamento
export const maxDuration = 300;

/**
 * POST /api/process
 * Body: { transcriptionId: string, engine?: "whisper" | "deepgram" }
 *
 * Orquestra o pipeline completo:
 * 1. Transcreve com Whisper ou Deepgram
 * 2. Formata com LLM
 *
 * Chamadas diretas (sem fetch interno) para compatibilidade com Railway.
 */
export async function POST(request: Request) {
    try {
        const { transcriptionId, engine = "whisper" } = await request.json();

        if (!transcriptionId) {
            return NextResponse.json({ error: "transcriptionId é obrigatório" }, { status: 400 });
        }

        const supabase = await createServerClient();
        console.log(`[Process] Starting pipeline for ${transcriptionId} with engine: ${engine}`);

        // 1. Transcrição
        try {
            if (engine === "deepgram") {
                await runDeepgramTranscription(transcriptionId, supabase);
            } else {
                await runWhisperTranscription(transcriptionId, supabase);
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Erro desconhecido";
            console.error(`[Process] Transcription failed:`, errMsg);
            await supabase
                .from("transcriptions")
                .update({ status: "error", error_message: errMsg, updated_at: new Date().toISOString() })
                .eq("id", transcriptionId);
            return NextResponse.json(
                { error: `Transcrição falhou: ${errMsg}`, step: "transcribe" },
                { status: 500 }
            );
        }

        // 2. Formatação com LLM
        try {
            await runFormatting(transcriptionId, supabase);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Erro desconhecido";
            console.error(`[Process] Formatting failed:`, errMsg);
            await supabase
                .from("transcriptions")
                .update({ status: "error", error_message: errMsg, updated_at: new Date().toISOString() })
                .eq("id", transcriptionId);
            return NextResponse.json(
                { error: `Formatação falhou: ${errMsg}`, step: "format" },
                { status: 500 }
            );
        }

        console.log(`[Process] Pipeline complete for ${transcriptionId}`);
        return NextResponse.json({
            success: true,
            engine,
        });
    } catch (err) {
        console.error("[Process] Pipeline error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Erro interno no pipeline" },
            { status: 500 }
        );
    }
}
