import { unlink, readFile, open, stat } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"]);

/** Verifica magic bytes para garantir que o arquivo é realmente áudio/vídeo. */
function isValidAudioVideo(buf: Buffer): boolean {
    if (buf.length < 12) return false;
    if ((buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ||
        (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)) return true;
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45) return true;
    if (buf[0] === 0x4F && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return true;
    if (buf[0] === 0x66 && buf[1] === 0x4C && buf[2] === 0x61 && buf[3] === 0x43) return true;
    if (buf.length >= 8 &&
        buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return true;
    if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return true;
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x41 && buf[9] === 0x56 && buf[10] === 0x49 && buf[11] === 0x20) return true;
    if (buf[0] === 0x46 && buf[1] === 0x4C && buf[2] === 0x56) return true;
    if (buf[0] === 0x30 && buf[1] === 0x26 && buf[2] === 0xB2 && buf[3] === 0x75) return true;
    return false;
}

export async function runDeepgramTranscription(
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

    // 2. Baixar arquivo como stream para /tmp
    await updateProgress(20);
    const urlPath = new URL(transcription.media_url).pathname;
    const ext = urlPath.split(".").pop()?.toLowerCase() ?? "";
    const isVideo = VIDEO_EXTENSIONS.has(ext);
    const tmpId = randomUUID();
    const downloadPath = join(tmpdir(), `dg-dl-${tmpId}.${ext || "bin"}`);

    console.log("[Deepgram] Streaming media to disk...");
    const mediaResponse = await fetch(transcription.media_url);
    if (!mediaResponse.ok) throw new Error("Não foi possível baixar o arquivo do Storage");
    if (!mediaResponse.body) throw new Error("Resposta sem body");

    await pipeline(
        Readable.fromWeb(mediaResponse.body as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(downloadPath)
    );

    const { size: fileSize } = await stat(downloadPath);
    console.log(`[Deepgram] Saved: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);

    // 2a. Verificar magic bytes
    const headerFh = await open(downloadPath, "r");
    const headerBuf = Buffer.alloc(12);
    try {
        await headerFh.read(headerBuf, 0, 12, 0);
    } finally {
        await headerFh.close();
    }
    if (!isValidAudioVideo(headerBuf)) {
        await unlink(downloadPath).catch((e) => console.error("[Deepgram] unlink error:", e));
        throw new Error("Arquivo inválido: formato de áudio/vídeo não reconhecido");
    }

    // 3. Converter se vídeo
    let audioBuffer: Buffer;
    let contentType = "audio/mpeg";

    try {
        if (isVideo) {
            await updateProgress(25);
            console.log("[Deepgram] Converting video to MP3...");
            const outputPath = join(tmpdir(), `dg-output-${tmpId}.mp3`);
            try {
                execSync(
                    `ffmpeg -i "${downloadPath}" -vn -acodec libmp3lame -ab 128k -ar 22050 -ac 1 -y "${outputPath}"`,
                    { timeout: 300000, stdio: "pipe" }
                );
                audioBuffer = await readFile(outputPath);
                console.log(`[Deepgram] Converted: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB`);
            } finally {
                await unlink(outputPath).catch((e) => console.error("[Deepgram] unlink error:", e));
            }
        } else {
            audioBuffer = await readFile(downloadPath);
            const ctMap: Record<string, string> = {
                mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
                m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
            };
            contentType = ctMap[ext] ?? "audio/mpeg";
        }
    } finally {
        await unlink(downloadPath).catch((e) => console.error("[Deepgram] unlink error:", e));
    }

    // 4. Enviar para Deepgram
    await updateProgress(35);
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) throw new Error("DEEPGRAM_API_KEY não configurada");

    console.log(`[Deepgram] Sending ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB to Nova-3...`);

    const dgRes = await fetch(
        "https://api.deepgram.com/v1/listen?" +
        new URLSearchParams({
            model: "nova-3",
            language: "pt-BR",
            smart_format: "true",
            diarize: "true",
            punctuate: "true",
            paragraphs: "true",
            utterances: "true",
            utt_split: "0.8",
        }).toString(),
        {
            method: "POST",
            headers: {
                Authorization: `Token ${deepgramApiKey}`,
                "Content-Type": contentType,
            },
            body: new Uint8Array(audioBuffer),
        }
    );

    if (!dgRes.ok) {
        const errText = await dgRes.text();
        console.error("[Deepgram] API error:", dgRes.status, errText);
        throw new Error(`Deepgram API: ${dgRes.status} — ${errText}`);
    }

    const dgData = await dgRes.json();
    await updateProgress(55);

    // 5. Mapear utterances
    const dgUtterances: Array<{
        speaker?: number;
        transcript: string;
        start: number;
        end: number;
        words?: Array<{ word: string; start: number; end: number; confidence: number; speaker?: number }>;
    }> = dgData?.results?.utterances ?? [];

    console.log(`[Deepgram] Returned ${dgUtterances.length} utterances`);

    if (dgUtterances.length === 0) {
        const transcript = dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
        if (transcript) {
            await supabase.from("utterances").insert({
                transcription_id: transcriptionId,
                speaker_label: "SPEAKER_00",
                text: transcript.trim(),
                start_time: 0,
                end_time: 0,
                words: null,
                sort_order: 0,
            });
        }
    } else {
        const utterancesToInsert = dgUtterances.map((utt, idx) => ({
            transcription_id: transcriptionId,
            speaker_label: `SPEAKER_${String(utt.speaker ?? 0).padStart(2, "0")}`,
            text: utt.transcript.trim(),
            start_time: utt.start,
            end_time: utt.end,
            words: utt.words
                ? utt.words.map((w) => ({
                    word: w.word,
                    start: w.start,
                    end: w.end,
                    confidence: w.confidence,
                    speaker: w.speaker ?? 0,
                }))
                : null,
            sort_order: idx,
        }));

        const { error: insertError } = await supabase
            .from("utterances")
            .insert(utterancesToInsert);

        if (insertError) {
            console.error("[Deepgram] Error inserting utterances:", insertError);
            throw new Error("Erro ao salvar falas");
        }
    }

    await updateProgress(65, "formatting");
}
