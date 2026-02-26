import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * GET /api/status/[id]
 * Retorna o status e progresso atual de uma degravação.
 * O client faz polling neste endpoint durante o processamento.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
        }

        const supabase = await createServerClient();

        const { data, error } = await supabase
            .from("transcriptions")
            .select("status, progress, title")
            .eq("id", id)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
        }

        // Mapear status para label e progresso estimado (fallback se progress for null)
        const statusMap: Record<string, { label: string; fallbackProgress: number }> = {
            uploading: { label: "Enviando arquivo...", fallbackProgress: 10 },
            transcribing: { label: "Transcrevendo com Whisper...", fallbackProgress: 40 },
            formatting: { label: "Formatando com IA...", fallbackProgress: 75 },
            completed: { label: "Concluído!", fallbackProgress: 100 },
            error: { label: "Erro no processamento", fallbackProgress: 0 },
        };

        const info = statusMap[data.status] ?? { label: data.status, fallbackProgress: 0 };

        return NextResponse.json({
            status: data.status,
            progress: data.progress ?? info.fallbackProgress,
            label: info.label,
            title: data.title,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Erro interno" },
            { status: 500 }
        );
    }
}
