import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { writeFile, unlink, readFile } from "fs/promises";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"]);
const MAX_WHISPER_SIZE = 24 * 1024 * 1024; // 24MB de segurança
const CHUNK_DURATION_SEC = 600; // 10 min por chunk

/**
 * POST /api/transcribe
 * Body: { transcriptionId: string }
 *
 * 1. Busca a degravação no banco (pega media_url)
 * 2. Baixa o arquivo do Supabase Storage
 * 3. Converte para MP3 com FFmpeg (128kbps/22kHz)
 * 4. Se o áudio ainda for > 24MB, faz chunking
 * 5. Envia para Azure Whisper (segments com timestamps)
 * 6. Salva as utterances no banco
 * 7. Atualiza o status para "formatting"
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

        // Helper para atualizar progresso
        const updateProgress = async (progress: number, status?: string) => {
            const update: Record<string, unknown> = { progress, updated_at: new Date().toISOString() };
            if (status) update.status = status;
            await supabase.from("transcriptions").update(update).eq("id", transcriptionId);
        };

        // Atualizar status para transcribing
        await updateProgress(15, "transcribing");

        // 2. Baixar o arquivo do Supabase Storage
        await updateProgress(20);
        console.log("Downloading media from:", transcription.media_url);
        const mediaResponse = await fetch(transcription.media_url);
        if (!mediaResponse.ok) {
            throw new Error("Não foi possível baixar o arquivo do Storage");
        }
        const mediaBuffer = Buffer.from(await mediaResponse.arrayBuffer());
        console.log(`Downloaded: ${(mediaBuffer.length / 1024 / 1024).toFixed(1)}MB`);

        // 3. Converter para MP3 de alta qualidade
        const urlPath = new URL(transcription.media_url).pathname;
        const ext = urlPath.split(".").pop()?.toLowerCase() ?? "";
        const isVideo = VIDEO_EXTENSIONS.has(ext);
        const needsConversion = isVideo || mediaBuffer.length > MAX_WHISPER_SIZE;

        let audioBuffer: Buffer;
        let audioFilename: string;
        const tmpId = randomUUID();
        const inputPath = join(tmpdir(), `input-${tmpId}.${ext || "mp4"}`);

        if (needsConversion) {
            await updateProgress(25);
            console.log("Converting to MP3 with FFmpeg (128kbps/22kHz)...");
            const outputPath = join(tmpdir(), `output-${tmpId}.mp3`);

            try {
                await writeFile(inputPath, mediaBuffer);

                // FFmpeg: 128kbps mono 22050Hz — melhor qualidade para speech
                execSync(
                    `ffmpeg -i "${inputPath}" -vn -acodec libmp3lame -ab 128k -ar 22050 -ac 1 -y "${outputPath}"`,
                    { timeout: 300000, stdio: "pipe" }
                );

                audioBuffer = await readFile(outputPath);
                audioFilename = "audio.mp3";
                console.log(`Converted: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB`);
            } finally {
                await unlink(inputPath).catch(() => { });
                await unlink(outputPath).catch(() => { });
            }
        } else {
            audioBuffer = mediaBuffer;
            audioFilename = `audio.${ext || "mp3"}`;
        }

        // 4. Chunking se necessário
        await updateProgress(30);
        const allSegments: Array<{ text: string; start: number; end: number }> = [];

        if (audioBuffer.length > MAX_WHISPER_SIZE) {
            console.log("Audio still > 24MB after conversion, chunking...");
            const chunkInputPath = join(tmpdir(), `chunk-input-${tmpId}.mp3`);
            await writeFile(chunkInputPath, audioBuffer);

            try {
                // Obter duração total
                const durationStr = execSync(
                    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${chunkInputPath}"`,
                    { timeout: 30000, encoding: "utf-8" }
                ).trim();
                const totalDuration = parseFloat(durationStr);
                const numChunks = Math.ceil(totalDuration / CHUNK_DURATION_SEC);
                console.log(`Total duration: ${totalDuration.toFixed(0)}s, splitting into ${numChunks} chunks`);

                for (let i = 0; i < numChunks; i++) {
                    const startSec = i * CHUNK_DURATION_SEC;
                    const chunkPath = join(tmpdir(), `chunk-${tmpId}-${i}.mp3`);

                    try {
                        execSync(
                            `ffmpeg -i "${chunkInputPath}" -ss ${startSec} -t ${CHUNK_DURATION_SEC} -acodec libmp3lame -ab 128k -ar 22050 -ac 1 -y "${chunkPath}"`,
                            { timeout: 120000, stdio: "pipe" }
                        );

                        const chunkBuffer = await readFile(chunkPath);
                        console.log(`Chunk ${i + 1}/${numChunks}: ${(chunkBuffer.length / 1024 / 1024).toFixed(1)}MB`);

                        // Enviar chunk para Whisper
                        const chunkSegments = await transcribeWithWhisper(chunkBuffer, `chunk_${i}.mp3`);

                        // Ajustar timestamps com o offset do chunk
                        for (const seg of chunkSegments) {
                            allSegments.push({
                                text: seg.text,
                                start: seg.start + startSec,
                                end: seg.end + startSec,
                            });
                        }

                        // Atualizar progresso por chunk
                        const chunkProgress = 35 + Math.round(((i + 1) / numChunks) * 20);
                        await updateProgress(chunkProgress);
                    } finally {
                        await unlink(chunkPath).catch(() => { });
                    }
                }
            } finally {
                await unlink(chunkInputPath).catch(() => { });
            }
        } else {
            // Áudio cabe em uma chamada só
            await updateProgress(35);
            const segments = await transcribeWithWhisper(audioBuffer, audioFilename);
            allSegments.push(...segments);
        }

        await updateProgress(55);
        console.log(`Whisper returned ${allSegments.length} total segments`);

        // 5. Salvar utterances no banco
        if (allSegments.length === 0) {
            // Fallback: sem segmentos, inserir texto vazio
            await supabase.from("utterances").insert({
                transcription_id: transcriptionId,
                speaker_label: "SPEAKER_00",
                text: "(Nenhum conteúdo transcrito)",
                start_time: 0,
                end_time: 0,
                words: null,
                sort_order: 0,
            });
        } else {
            const utterancesToInsert = allSegments.map((seg, idx) => ({
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
        await updateProgress(65, "formatting");

        return NextResponse.json({
            success: true,
            segmentCount: allSegments.length,
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

// ─── Whisper API call ────────────────────────────────────────────────────────
async function transcribeWithWhisper(
    audioBuffer: Buffer,
    filename: string
): Promise<Array<{ text: string; start: number; end: number }>> {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
    const apiKey = process.env.AZURE_OPENAI_API_KEY!;
    const whisperUrl = `${endpoint}/openai/deployments/whisper/audio/transcriptions?api-version=2024-06-01`;

    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(audioBuffer)]), filename);
    formData.append("response_format", "verbose_json");
    formData.append("language", "pt");
    formData.append("timestamp_granularities[]", "segment");

    console.log(`Sending ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB to Whisper...`);
    const whisperRes = await fetch(whisperUrl, {
        method: "POST",
        headers: { "api-key": apiKey },
        body: formData,
    });

    if (!whisperRes.ok) {
        const errorText = await whisperRes.text();
        console.error("Whisper API error:", errorText);
        throw new Error(`Whisper: ${errorText}`);
    }

    const whisperData = await whisperRes.json();

    const segments: Array<{ id: number; text: string; start: number; end: number }> =
        whisperData.segments ?? [];

    if (segments.length === 0 && whisperData.text) {
        return [{
            text: whisperData.text.trim(),
            start: 0,
            end: whisperData.duration ?? 0,
        }];
    }

    return segments.map((seg) => ({
        text: seg.text,
        start: seg.start,
        end: seg.end,
    }));
}
