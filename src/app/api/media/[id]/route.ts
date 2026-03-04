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
        console.error("[/api/media] Transcription not found or no media_url:", error);
        return NextResponse.json(
            { error: "Transcrição ou mídia não encontrada" },
            { status: 404 }
        );
    }

    console.log("[/api/media] media_url from DB:", transcription.media_url);

    // 2. Extrair o path do storage a partir do media_url
    // Formatos possíveis:
    //   https://xxx.supabase.co/storage/v1/object/public/media/ID/media.ext
    //   https://xxx.supabase.co/storage/v1/object/sign/media/ID/media.ext
    try {
        const url = new URL(transcription.media_url);

        // Extrair tudo após /media/ no pathname (nome do bucket)
        const mediaMatch = url.pathname.match(/\/media\/(.+)$/);

        if (!mediaMatch) {
            console.error("[/api/media] Could not extract path from URL:", url.pathname);
            // Fallback: tentar construir o path a partir do ID
            // Listar arquivos no diretório do ID
            const { data: files } = await supabase.storage
                .from("media")
                .list(id);

            if (files && files.length > 0) {
                const storagePath = `${id}/${files[0].name}`;
                console.log("[/api/media] Found file via listing:", storagePath);

                const { data: signedData, error: signError } = await supabase.storage
                    .from("media")
                    .createSignedUrl(storagePath, 7200);

                if (!signError && signedData?.signedUrl) {
                    return NextResponse.json({ url: signedData.signedUrl });
                }
            }

            // Último fallback: retornar a URL original
            return NextResponse.json({ url: transcription.media_url });
        }

        const storagePath = mediaMatch[1];
        console.log("[/api/media] Storage path:", storagePath);

        // 3. Gerar signed URL (válida por 2 horas)
        const { data: signedData, error: signError } = await supabase.storage
            .from("media")
            .createSignedUrl(storagePath, 7200); // 2 horas

        if (signError || !signedData?.signedUrl) {
            console.error("[/api/media] Signed URL error:", signError);
            // Fallback: retornar a URL pública original
            return NextResponse.json({ url: transcription.media_url });
        }

        console.log("[/api/media] Generated signed URL successfully");
        return NextResponse.json({ url: signedData.signedUrl });
    } catch (err) {
        console.error("[/api/media] Error:", err);
        return NextResponse.json({ url: transcription.media_url });
    }
}
