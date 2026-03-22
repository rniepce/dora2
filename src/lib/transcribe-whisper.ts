import { writeFile, unlink, readFile, open } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";

const execFileAsync = promisify(execFile);
import { join } from "path";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateMediaBuffer } from "./validate-media";

const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"]);
const MAX_WHISPER_SIZE = 24 * 1024 * 1024;
const CHUNK_DURATION_SEC = 600;

export async function runWhisperTranscription(
    transcriptionId: string,
    supabase: SupabaseClient
) {
    const updateProgress = async (progress: number, status?: string) => {
        const update: Record<string, unknown> = { progress, updated_at: new Date().toISOString() };
        if (status) update.status = status;
        await supabase.from("transcriptions").update(update).eq("id", transcriptionId);
    };

    // 1. Buscar degravação
    const { data: transcription, error: fetchError } = await supabase
        .from("transcriptions")
        .select("*")
        .eq("id", transcriptionId)
        .single();

    if (fetchError || !transcription) throw new Error("Degravação não encontrada");
    if (!transcription.media_url) throw new Error("Áudio ainda não foi enviado");

    await updateProgress(15, "transcribing");

    // 2. Baixar arquivo via stream diretamente para disco (evita carregar 1GB em memória)
    await updateProgress(20);
    console.log("[Whisper] Downloading media from:", transcription.media_url);
    const mediaResponse = await fetch(transcription.media_url);
    if (!mediaResponse.ok) throw new Error("Não foi possível baixar o arquivo do Storage");

    const urlPath = new URL(transcription.media_url).pathname;
    const ext = urlPath.split(".").pop()?.toLowerCase() ?? "";
    const tmpId = randomUUID();
    const downloadPath = join(tmpdir(), `ws-download-${tmpId}.${ext || "mp3"}`);

    // Stream para disco
    if (mediaResponse.body) {
        const dest = createWriteStream(downloadPath);
        await pipeline(mediaResponse.body as unknown as NodeJS.ReadableStream, dest);
    } else {
        const buf = Buffer.from(await mediaResponse.arrayBuffer());
        await writeFile(downloadPath, buf);
    }

    // Ler apenas o início para magic bytes (primeiros 4KB bastam)
    const headerBuf = Buffer.alloc(4096);
    const fh = await open(downloadPath, "r");
    const { bytesRead } = await fh.read(headerBuf, 0, 4096, 0);
    await fh.close();
    const mediaBuffer = headerBuf.subarray(0, bytesRead);

    const stats = await import("fs/promises").then((m) => m.stat(downloadPath));
    console.log(`[Whisper] Downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);

    // Validar magic bytes do arquivo
    await validateMediaBuffer(mediaBuffer, transcription.media_url);

    // 3. Converter para MP3 (usa o arquivo já em disco — não carrega em memória)
    try {
    const isVideo = VIDEO_EXTENSIONS.has(ext);
    const fileSizeBytes = stats.size;
    const needsConversion = isVideo || fileSizeBytes > MAX_WHISPER_SIZE;

    let audioBuffer: Buffer;
    let audioFilename: string;

    if (needsConversion) {
        await updateProgress(25);
        console.log("[Whisper] Converting to MP3 (128kbps/22kHz)...");
        const outputPath = join(tmpdir(), `output-${tmpId}.mp3`);

        try {
            await execFileAsync("ffmpeg", [
                "-i", downloadPath,
                "-vn", "-acodec", "libmp3lame", "-ab", "128k", "-ar", "22050", "-ac", "1", "-y",
                outputPath,
            ], { timeout: 300000 });
            audioBuffer = await readFile(outputPath);
            audioFilename = "audio.mp3";
            console.log(`[Whisper] Converted: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB`);
        } finally {
            await unlink(outputPath).catch((e) => { console.error("[Whisper] Failed to delete outputPath:", e); });
        }
    } else {
        audioBuffer = await readFile(downloadPath);
        audioFilename = `audio.${ext || "mp3"}`;
    }

    // 4. Chunking se necessário
    await updateProgress(30);
    const allSegments: Array<{ text: string; start: number; end: number }> = [];

    if (audioBuffer.length > MAX_WHISPER_SIZE) {
        console.log("[Whisper] Audio still > 24MB, chunking...");
        const chunkInputPath = join(tmpdir(), `chunk-input-${tmpId}.mp3`);
        await writeFile(chunkInputPath, audioBuffer);

        try {
            const { stdout: durationStr } = await execFileAsync("ffprobe", [
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "csv=p=0",
                chunkInputPath,
            ], { timeout: 30000 });
            const totalDuration = parseFloat(durationStr.trim());
            const numChunks = Math.ceil(totalDuration / CHUNK_DURATION_SEC);
            console.log(`[Whisper] Duration: ${totalDuration.toFixed(0)}s, ${numChunks} chunks`);

            for (let i = 0; i < numChunks; i++) {
                const startSec = i * CHUNK_DURATION_SEC;
                const chunkPath = join(tmpdir(), `chunk-${tmpId}-${i}.mp3`);

                try {
                    await execFileAsync("ffmpeg", [
                        "-i", chunkInputPath,
                        "-ss", String(startSec),
                        "-t", String(CHUNK_DURATION_SEC),
                        "-acodec", "libmp3lame", "-ab", "128k", "-ar", "22050", "-ac", "1", "-y",
                        chunkPath,
                    ], { timeout: 120000 });
                    const chunkBuffer = await readFile(chunkPath);
                    const chunkSegments = await callWhisperAPI(chunkBuffer, `chunk_${i}.mp3`);

                    for (const seg of chunkSegments) {
                        allSegments.push({
                            text: seg.text,
                            start: seg.start + startSec,
                            end: seg.end + startSec,
                        });
                    }

                    const chunkProgress = 35 + Math.round(((i + 1) / numChunks) * 20);
                    await updateProgress(chunkProgress);
                } finally {
                    await unlink(chunkPath).catch((e) => { console.error("[Whisper] Failed to delete chunkPath:", e); });
                }
            }
        } finally {
            await unlink(chunkInputPath).catch((e) => { console.error("[Whisper] Failed to delete chunkInputPath:", e); });
        }
    } else {
        await updateProgress(35);
        const segments = await callWhisperAPI(audioBuffer, audioFilename);
        allSegments.push(...segments);
    }

    await updateProgress(55);
    console.log(`[Whisper] Total segments: ${allSegments.length}`);

    // 5. Salvar utterances
    if (allSegments.length === 0) {
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
            console.error("[Whisper] Error inserting utterances:", insertError);
            throw new Error("Erro ao salvar falas");
        }
    }

    await updateProgress(65, "formatting");
    } finally {
        // Limpar arquivo de download
        await unlink(downloadPath).catch((e) => { console.error("[Whisper] Failed to delete downloadPath:", e); });
    }
}

async function callWhisperAPI(
    audioBuffer: Buffer,
    filename: string
): Promise<Array<{ text: string; start: number; end: number }>> {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;

    if (!endpoint || !apiKey) {
        throw new Error("AZURE_OPENAI_ENDPOINT ou AZURE_OPENAI_API_KEY não configurados");
    }

    const whisperUrl = `${endpoint}/openai/deployments/whisper/audio/transcriptions?api-version=2024-06-01`;

    const file = new File([new Uint8Array(audioBuffer)], filename, { type: "audio/mpeg" });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("response_format", "verbose_json");
    formData.append("language", "pt");
    formData.append("timestamp_granularities[]", "segment");

    console.log(`[Whisper] Sending ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB to Azure Whisper...`);
    console.log(`[Whisper] Endpoint: ${endpoint}`);

    // 5 min timeout para áudios longos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    try {
        const res = await fetch(whisperUrl, {
            method: "POST",
            headers: { "api-key": apiKey },
            body: formData,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            const errorText = await res.text();
            console.error("[Whisper] API error:", res.status, errorText);
            throw new Error(`Whisper API ${res.status}: ${errorText.substring(0, 300)}`);
        }

        const data = await res.json();
        console.log(`[Whisper] OK — segments: ${data.segments?.length ?? 0}, text: ${data.text?.length ?? 0} chars`);

        const segments: Array<{ id: number; text: string; start: number; end: number }> = data.segments ?? [];

        if (segments.length === 0 && data.text) {
            return [{ text: data.text.trim(), start: 0, end: data.duration ?? 0 }];
        }

        return segments.map((seg) => ({ text: seg.text, start: seg.start, end: seg.end }));
    } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") {
            throw new Error("Whisper API timeout (5 min) — áudio pode ser muito longo");
        }
        throw err;
    }
}
