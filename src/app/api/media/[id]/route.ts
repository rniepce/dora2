import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * GET /api/media/[id]
 * Gera uma signed URL para o arquivo de mídia da transcrição.
 * Mais confiável que public URL para arquivos grandes enviados via TUS.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createServerClient();

    // 1. Buscar a transcrição para obter o media_url
    const { data: transcription, error } = await supabase
        .from("transcriptions")
        .select("media_url, user_id")
        .eq("id", id)
        .single();

    if (error || !transcription?.media_url) {
        return NextResponse.json(
            { error: "Transcrição ou mídia não encontrada" },
            { status: 404 }
        );
    }

    // 2. Extrair o path do storage a partir do media_url
    // media_url tem o formato: https://xxx.supabase.co/storage/v1/object/public/media/ID/media.ext
    try {
        const url = new URL(transcription.media_url);
        const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/media\/(.+)$/);

        if (!pathMatch) {
            return NextResponse.json(
                { error: "Formato de URL de mídia inválido" },
                { status: 400 }
            );
        }

        const storagePath = pathMatch[1];

        // 3. Gerar signed URL (válida por 2 horas)
        const { data: signedData, error: signError } = await supabase.storage
            .from("media")
            .createSignedUrl(storagePath, 7200); // 2 horas

        if (signError || !signedData?.signedUrl) {
            console.error("Signed URL error:", signError);
            // Fallback: retornar a URL pública original
            return NextResponse.json({ url: transcription.media_url });
        }

        return NextResponse.json({ url: signedData.signedUrl });
    } catch (err) {
        console.error("Media URL error:", err);
        return NextResponse.json({ url: transcription.media_url });
    }
}
