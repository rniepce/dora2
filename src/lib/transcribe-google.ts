import { writeFile, unlink, readFile } from "fs/promises";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"]);
const CHUNK_DURATION_SEC = 480; // 8 min — margem segura para Recognize (~10 min max)
const REGION = "us";

// ─── Tipos de resposta da API ────────────────────────────────────────────────

interface GoogleWordInfo {
    startOffset?: string;  // "1.500s"
    endOffset?: string;
    word: string;
    confidence?: number;
    speakerLabel?: string; // "1", "2", etc.
}

interface GoogleAlternative {
    transcript: string;
    confidence?: number;
    words?: GoogleWordInfo[];
}

interface GoogleResult {
    alternatives?: GoogleAlternative[];
    resultEndOffset?: string;
    languageCode?: string;
}

interface GoogleRecognizeResponse {
    results?: GoogleResult[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Converte "1.500s" → 1.5 */
function parseDuration(d?: string): number {
    if (!d) return 0;
    return parseFloat(d.replace("s", ""));
}

// ─── Função principal ────────────────────────────────────────────────────────

export async function runGoogleTranscription(
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
    console.log("[Google] Downloading media from:", transcription.media_url);
    const mediaResponse = await fetch(transcription.media_url);
    if (!mediaResponse.ok) throw new Error("Não foi possível baixar o arquivo do Storage");
    const mediaBuffer = Buffer.from(await mediaResponse.arrayBuffer());
    console.log(`[Google] Downloaded: ${(mediaBuffer.length / 1024 / 1024).toFixed(1)}MB`);

    // 3. Converter para WAV mono 16kHz (formato ideal para Chirp 3)
    const urlPath = new URL(transcription.media_url).pathname;
    const ext = urlPath.split(".").pop()?.toLowerCase() ?? "";
    const isVideo = VIDEO_EXTENSIONS.has(ext);
    const tmpId = randomUUID();

    await updateProgress(25);
    console.log("[Google] Converting to WAV (mono 16kHz)...");

    const inputPath = join(tmpdir(), `gc-input-${tmpId}.${ext || "mp4"}`);
    const outputPath = join(tmpdir(), `gc-output-${tmpId}.wav`);

    let audioBuffer: Buffer;

    try {
        await writeFile(inputPath, mediaBuffer);
        execSync(
            `ffmpeg -i "${inputPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 -y "${outputPath}"`,
            { timeout: 600000, stdio: "pipe" }
        );
        audioBuffer = await readFile(outputPath);
        console.log(`[Google] Converted: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB WAV`);
    } finally {
        await unlink(inputPath).catch(() => { });
        await unlink(outputPath).catch(() => { });
    }

    // 4. Transcrever (com chunking se necessário)
    await updateProgress(30);

    // Durar em segundos (WAV PCM 16kHz mono 16-bit = 32000 bytes/seg)
    const estimatedDurationSec = audioBuffer.length / 32000;
    console.log(`[Google] Estimated duration: ${estimatedDurationSec.toFixed(0)}s`);

    interface ParsedUtterance {
        speaker: string;
        text: string;
        start: number;
        end: number;
        words: Array<{ word: string; start: number; end: number; confidence: number; speaker: number }>;
    }

    let allUtterances: ParsedUtterance[] = [];

    if (estimatedDurationSec > CHUNK_DURATION_SEC) {
        // Chunking para áudios longos
        console.log("[Google] Audio too long, chunking...");
        const chunkInputPath = join(tmpdir(), `gc-chunk-input-${tmpId}.wav`);
        await writeFile(chunkInputPath, audioBuffer);

        try {
            const durationStr = execSync(
                `ffprobe -v error -show_entries format=duration -of csv=p=0 "${chunkInputPath}"`,
                { timeout: 30000, encoding: "utf-8" }
            ).trim();
            const totalDuration = parseFloat(durationStr);
            const numChunks = Math.ceil(totalDuration / CHUNK_DURATION_SEC);
            console.log(`[Google] Duration: ${totalDuration.toFixed(0)}s, ${numChunks} chunks`);

            for (let i = 0; i < numChunks; i++) {
                const startSec = i * CHUNK_DURATION_SEC;
                const chunkPath = join(tmpdir(), `gc-chunk-${tmpId}-${i}.wav`);

                try {
                    execSync(
                        `ffmpeg -i "${chunkInputPath}" -ss ${startSec} -t ${CHUNK_DURATION_SEC} -acodec pcm_s16le -ar 16000 -ac 1 -y "${chunkPath}"`,
                        { timeout: 120000, stdio: "pipe" }
                    );
                    const chunkBuffer = await readFile(chunkPath);
                    const chunkResults = await callGoogleRecognize(chunkBuffer);
                    const chunkUtterances = parseResults(chunkResults, startSec);
                    allUtterances.push(...chunkUtterances);

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
        await updateProgress(35);
        const results = await callGoogleRecognize(audioBuffer);
        allUtterances = parseResults(results, 0);
    }

    await updateProgress(55);
    console.log(`[Google] Total utterances: ${allUtterances.length}`);

    // 5. Salvar utterances
    if (allUtterances.length === 0) {
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
        const utterancesToInsert = allUtterances.map((utt, idx) => ({
            transcription_id: transcriptionId,
            speaker_label: utt.speaker,
            text: utt.text.trim(),
            start_time: utt.start,
            end_time: utt.end,
            words: utt.words.length > 0 ? utt.words : null,
            sort_order: idx,
        }));

        const { error: insertError } = await supabase
            .from("utterances")
            .insert(utterancesToInsert);

        if (insertError) {
            console.error("[Google] Error inserting utterances:", insertError);
            throw new Error("Erro ao salvar falas");
        }
    }

    await updateProgress(65, "formatting");
}

// ─── Google Speech-to-Text V2 API call ───────────────────────────────────────

async function callGoogleRecognize(
    audioBuffer: Buffer
): Promise<GoogleRecognizeResponse> {
    const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

    if (!apiKey) throw new Error("GOOGLE_CLOUD_API_KEY não configurada");
    if (!projectId) throw new Error("GOOGLE_CLOUD_PROJECT_ID não configurado");

    const recognizeUrl =
        `https://${REGION}-speech.googleapis.com/v2/projects/${projectId}/locations/${REGION}/recognizers/_:recognize?key=${apiKey}`;

    const requestBody = {
        config: {
            autoDecodingConfig: {},
            languageCodes: ["pt-BR"],
            model: "chirp_3",
            features: {
                enableWordTimeOffsets: true,
                enableWordConfidence: true,
                diarizationConfig: {},
            },
        },
        content: audioBuffer.toString("base64"),
    };

    console.log(`[Google] Sending ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB to Chirp 3...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 min timeout

    try {
        const res = await fetch(recognizeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            const errorText = await res.text();
            console.error("[Google] API error:", res.status, errorText);
            throw new Error(`Google Speech API ${res.status}: ${errorText.substring(0, 300)}`);
        }

        const data: GoogleRecognizeResponse = await res.json();
        console.log(`[Google] OK — results: ${data.results?.length ?? 0}`);
        return data;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") {
            throw new Error("Google Speech API timeout (10 min) — áudio pode ser muito longo");
        }
        throw err;
    }
}

// ─── Parse de resultados com diarização ──────────────────────────────────────

function parseResults(
    response: GoogleRecognizeResponse,
    timeOffset: number
): Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
    words: Array<{ word: string; start: number; end: number; confidence: number; speaker: number }>;
}> {
    const results = response.results ?? [];
    if (results.length === 0) return [];

    // Coletar todas as words com seus speakers
    const allWords: Array<{
        word: string;
        start: number;
        end: number;
        confidence: number;
        speakerLabel: string;
    }> = [];

    for (const result of results) {
        const alt = result.alternatives?.[0];
        if (!alt?.words) continue;

        for (const w of alt.words) {
            allWords.push({
                word: w.word,
                start: parseDuration(w.startOffset) + timeOffset,
                end: parseDuration(w.endOffset) + timeOffset,
                confidence: w.confidence ?? 0,
                speakerLabel: w.speakerLabel ?? "1",
            });
        }
    }

    if (allWords.length === 0) {
        // Fallback: sem words, usar transcript direto
        const utterances: Array<{
            speaker: string;
            text: string;
            start: number;
            end: number;
            words: Array<{ word: string; start: number; end: number; confidence: number; speaker: number }>;
        }> = [];

        for (const result of results) {
            const alt = result.alternatives?.[0];
            if (!alt?.transcript) continue;
            utterances.push({
                speaker: "SPEAKER_00",
                text: alt.transcript,
                start: timeOffset,
                end: parseDuration(result.resultEndOffset) + timeOffset,
                words: [],
            });
        }
        return utterances;
    }

    // Agrupar words consecutivas pelo mesmo speaker em utterances
    const utterances: Array<{
        speaker: string;
        text: string;
        start: number;
        end: number;
        words: Array<{ word: string; start: number; end: number; confidence: number; speaker: number }>;
    }> = [];

    let currentSpeaker = allWords[0].speakerLabel;
    let currentWords: typeof allWords = [allWords[0]];

    for (let i = 1; i < allWords.length; i++) {
        const w = allWords[i];
        if (w.speakerLabel === currentSpeaker) {
            currentWords.push(w);
        } else {
            // Flush utterance
            utterances.push(buildUtterance(currentSpeaker, currentWords));
            currentSpeaker = w.speakerLabel;
            currentWords = [w];
        }
    }
    // Flush last utterance
    utterances.push(buildUtterance(currentSpeaker, currentWords));

    return utterances;
}

function buildUtterance(
    speakerLabel: string,
    words: Array<{ word: string; start: number; end: number; confidence: number; speakerLabel: string }>
) {
    const speakerNum = parseInt(speakerLabel, 10) - 1; // Google usa "1", "2"... converter para 0-based
    const label = `SPEAKER_${String(Math.max(0, speakerNum)).padStart(2, "0")}`;

    return {
        speaker: label,
        text: words.map((w) => w.word).join(" "),
        start: words[0].start,
        end: words[words.length - 1].end,
        words: words.map((w) => ({
            word: w.word,
            start: w.start,
            end: w.end,
            confidence: w.confidence,
            speaker: Math.max(0, parseInt(w.speakerLabel, 10) - 1),
        })),
    };
}
