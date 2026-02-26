import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { writeFile, unlink, readFile } from "fs/promises";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"]);
const MAX_WHISPER_SIZE = 24 * 1024 * 1024; // 24MB de segurança

/**
 * POST /api/transcribe
 * Body: { transcriptionId: string }
 *
 * 1. Busca a degravação no banco (pega media_url)
 * 2. Baixa o arquivo do Supabase Storage
 * 3. Se é vídeo ou > 24MB, converte para MP3 com FFmpeg
 * 4. Envia para Azure Whisper (segments com timestamps)
 * 5. Salva as utterances no banco
 * 6. Atualiza o status para "formatting"
 */
export async function POST(request: Request) {
    try {
        const { transcriptionId } = await request.json();

        if (!transcriptionId) {
            return NextResponse.json({ error: "transcriptionId é obrigatório" }, { status: 400 });
        }

        const supabase = await createServerClient();

        // 1. Buscar a degravação
        const { data: transcription, error: fetchError } = await supabase
            .from("transcriptions")
            .select("*")
            .eq("id", transcriptionId)
            .single();

        if (fetchError || !transcription) {
            return NextResponse.json({ error: "Degravação não encontrada" }, { status: 404 });
        }

        if (!transcription.media_url) {
            return NextResponse.json({ error: "Áudio ainda não foi enviado" }, { status: 400 });
        }

        // Atualizar status para transcribing
        await supabase
            .from("transcriptions")
            .update({ status: "transcribing", updated_at: new Date().toISOString() })
            .eq("id", transcriptionId);

        // 2. Baixar o arquivo do Supabase Storage
        console.log("Downloading media from:", transcription.media_url);
        const mediaResponse = await fetch(transcription.media_url);
        if (!mediaResponse.ok) {
            throw new Error("Não foi possível baixar o arquivo do Storage");
        }
        const mediaBuffer = Buffer.from(await mediaResponse.arrayBuffer());
        console.log(`Downloaded: ${(mediaBuffer.length / 1024 / 1024).toFixed(1)}MB`);

        // 3. Determinar se precisa converter
        const urlPath = new URL(transcription.media_url).pathname;
        const ext = urlPath.split(".").pop()?.toLowerCase() ?? "";
        const isVideo = VIDEO_EXTENSIONS.has(ext);
        const needsConversion = isVideo || mediaBuffer.length > MAX_WHISPER_SIZE;

        let audioBuffer: Buffer;
        let audioFilename: string;

        if (needsConversion) {
            console.log("Converting to MP3 with FFmpeg...");
            const tmpId = randomUUID();
            const inputPath = join(tmpdir(), `input-${tmpId}.${ext || "mp4"}`);
            const outputPath = join(tmpdir(), `output-${tmpId}.mp3`);

            try {
                await writeFile(inputPath, mediaBuffer);

                // FFmpeg: extrair áudio, comprimir para MP3 mono 64kbps
                execSync(
                    `ffmpeg -i "${inputPath}" -vn -acodec libmp3lame -ab 64k -ar 16000 -ac 1 -y "${outputPath}"`,
                    { timeout: 120000, stdio: "pipe" }
                );

                audioBuffer = await readFile(outputPath);
                audioFilename = "audio.mp3";
                console.log(`Converted: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB`);
            } finally {
                // Limpar arquivos temporários
                await unlink(inputPath).catch(() => { });
                await unlink(outputPath).catch(() => { });
            }
        } else {
            audioBuffer = mediaBuffer;
            audioFilename = `audio.${ext || "mp3"}`;
        }

        // 4. Enviar para Azure Whisper
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
        const apiKey = process.env.AZURE_OPENAI_API_KEY!;
        const whisperUrl = `${endpoint}/openai/deployments/whisper/audio/transcriptions?api-version=2024-06-01`;

        const formData = new FormData();
        formData.append("file", new Blob([new Uint8Array(audioBuffer)]), audioFilename);
        formData.append("response_format", "verbose_json");
        formData.append("language", "pt");
        formData.append("timestamp_granularities[]", "segment");

        console.log("Sending to Whisper...");
        const whisperRes = await fetch(whisperUrl, {
            method: "POST",
            headers: { "api-key": apiKey },
            body: formData,
        });

        if (!whisperRes.ok) {
            const errorText = await whisperRes.text();
            console.error("Whisper API error:", errorText);
            await supabase
                .from("transcriptions")
                .update({ status: "error", updated_at: new Date().toISOString() })
                .eq("id", transcriptionId);
            return NextResponse.json({ error: `Whisper: ${errorText}` }, { status: 500 });
        }

        const whisperData = await whisperRes.json();
        console.log(`Whisper returned ${whisperData.segments?.length ?? 0} segments`);

        // 5. Mapear segments e salvar no banco
        const segments: Array<{
            id: number;
            text: string;
            start: number;
            end: number;
        }> = whisperData.segments ?? [];

        if (segments.length === 0 && whisperData.text) {
            await supabase.from("utterances").insert({
                transcription_id: transcriptionId,
                speaker_label: "SPEAKER_00",
                text: whisperData.text.trim(),
                start_time: 0,
                end_time: whisperData.duration ?? 0,
                words: null,
                sort_order: 0,
            });
        } else {
            const utterancesToInsert = segments.map((seg, idx) => ({
                transcription_id: transcriptionId,
                speaker_label: "SPEAKER_00",
                text: seg.text.trim(),
                start_time: seg.start,
                end_time: seg.end,
                words: null,
                sort_order: idx,
            }));

            const { error: insertError } = await supabase
                .from("utterances")
                .insert(utterancesToInsert);

            if (insertError) {
                console.error("Error inserting utterances:", insertError);
                await supabase
                    .from("transcriptions")
                    .update({ status: "error", updated_at: new Date().toISOString() })
                    .eq("id", transcriptionId);
                return NextResponse.json({ error: "Erro ao salvar falas" }, { status: 500 });
            }
        }

        // 6. Atualizar status para formatting
        await supabase
            .from("transcriptions")
            .update({ status: "formatting", updated_at: new Date().toISOString() })
            .eq("id", transcriptionId);

        return NextResponse.json({
            success: true,
            segmentCount: segments.length,
            duration: whisperData.duration,
            converted: needsConversion,
        });
    } catch (err) {
        console.error("Transcribe route error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Erro interno" },
            { status: 500 }
        );
    }
}
