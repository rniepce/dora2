import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * GET /api/debug/media/[id]
 * Diagnostica por que o vídeo não está tocando para uma transcrição.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createServerClient();

    const diagnostics: Record<string, unknown> = { transcriptionId: id };

    // 1. Buscar transcrição
    const { data: transcription, error: tError } = await supabase
        .from("transcriptions")
        .select("id, media_url, status, title")
        .eq("id", id)
        .single();

    if (tError || !transcription) {
        diagnostics.error = "Transcrição não encontrada";
        diagnostics.dbError = tError;
        return NextResponse.json(diagnostics, { status: 404 });
    }

    diagnostics.title = transcription.title;
    diagnostics.status = transcription.status;
    diagnostics.media_url = transcription.media_url;
    diagnostics.media_url_empty = !transcription.media_url;

    if (!transcription.media_url) {
        diagnostics.problem = "media_url está NULL no banco de dados — o upload não salvou a URL";
        return NextResponse.json(diagnostics);
    }

    // 2. Verificar se o arquivo existe no Storage
    // Extrair path do media_url
    try {
        const url = new URL(transcription.media_url);
        diagnostics.url_pathname = url.pathname;

        // Tentar extrair storage path
        const mediaMatch = url.pathname.match(/\/media\/(.+)$/);
        if (mediaMatch) {
            const storagePath = mediaMatch[1];
            diagnostics.storage_path = storagePath;

            // Listar o diretório do ID
            const dirPath = storagePath.split("/")[0]; // UUID
            const { data: files, error: listError } = await supabase.storage
                .from("media")
                .list(dirPath);

            diagnostics.storage_list_error = listError;
            diagnostics.files_in_directory = files?.map(f => ({
                name: f.name,
                size: (f.metadata as Record<string, unknown>)?.size,
                mimetype: (f.metadata as Record<string, unknown>)?.mimetype,
            }));
            diagnostics.files_count = files?.length ?? 0;
        } else {
            diagnostics.problem = "Não foi possível extrair o path do Storage a partir da media_url";
        }
    } catch (err) {
        diagnostics.url_parse_error = String(err);
    }

    // 3. Testar se a URL pública é acessível
    try {
        const headRes = await fetch(transcription.media_url, { method: "HEAD" });
        diagnostics.public_url_status = headRes.status;
        diagnostics.public_url_ok = headRes.ok;
        diagnostics.public_url_content_type = headRes.headers.get("content-type");
        diagnostics.public_url_content_length = headRes.headers.get("content-length");
        diagnostics.public_url_cors = headRes.headers.get("access-control-allow-origin");
    } catch (err) {
        diagnostics.public_url_fetch_error = String(err);
    }

    // 4. Gerar signed URL e testar
    try {
        const mediaMatch = new URL(transcription.media_url).pathname.match(/\/media\/(.+)$/);
        if (mediaMatch) {
            const { data: signedData, error: signError } = await supabase.storage
                .from("media")
                .createSignedUrl(mediaMatch[1], 3600);

            diagnostics.signed_url_error = signError;
            diagnostics.signed_url = signedData?.signedUrl;

            if (signedData?.signedUrl) {
                const signedRes = await fetch(signedData.signedUrl, { method: "HEAD" });
                diagnostics.signed_url_status = signedRes.status;
                diagnostics.signed_url_ok = signedRes.ok;
                diagnostics.signed_url_content_type = signedRes.headers.get("content-type");
            }
        }
    } catch (err) {
        diagnostics.signed_url_test_error = String(err);
    }

    return NextResponse.json(diagnostics, { status: 200 });
}
