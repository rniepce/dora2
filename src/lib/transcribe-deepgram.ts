import { writeFile, unlink, readFile } from "fs/promises";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"]);

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

    // 2. Baixar arquivo
    await updateProgress(20);
    console.log("[Deepgram] Downloading media from:", transcription.media_url);
    const mediaResponse = await fetch(transcription.media_url);
    if (!mediaResponse.ok) throw new Error("Não foi possível baixar o arquivo do Storage");
    const mediaBuffer = Buffer.from(await mediaResponse.arrayBuffer());
    console.log(`[Deepgram] Downloaded: ${(mediaBuffer.length / 1024 / 1024).toFixed(1)}MB`);

    // 3. Converter se vídeo
    const urlPath = new URL(transcription.media_url).pathname;
    const ext = urlPath.split(".").pop()?.toLowerCase() ?? "";
    const isVideo = VIDEO_EXTENSIONS.has(ext);

    let audioBuffer: Buffer;
    let contentType = "audio/mpeg";

    if (isVideo) {
        await updateProgress(25);
        console.log("[Deepgram] Converting video to MP3...");
        const tmpId = randomUUID();
        const inputPath = join(tmpdir(), `dg-input-${tmpId}.${ext}`);
        const outputPath = join(tmpdir(), `dg-output-${tmpId}.mp3`);

        try {
            await writeFile(inputPath, mediaBuffer);
            execSync(
                `ffmpeg -i "${inputPath}" -vn -acodec libmp3lame -ab 128k -ar 22050 -ac 1 -y "${outputPath}"`,
                { timeout: 300000, stdio: "pipe" }
            );
            audioBuffer = await readFile(outputPath);
            console.log(`[Deepgram] Converted: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB`);
        } finally {
            await unlink(inputPath).catch(() => { });
            await unlink(outputPath).catch(() => { });
        }
    } else {
        audioBuffer = mediaBuffer;
        const ctMap: Record<string, string> = {
            mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
            m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
        };
        contentType = ctMap[ext] ?? "audio/mpeg";
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
