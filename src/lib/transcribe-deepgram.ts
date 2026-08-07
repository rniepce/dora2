import { writeFile, unlink, readFile } from "fs/promises";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"]);

// ─── Pós-processamento: artigo indefinido virando algarismo ──────────────────
// O smart_format do Deepgram converte números por extenso em algarismos e não
// distingue o numeral "um" do artigo: "só um pouquinho" vira "só 1 pouquinho".
// Desligar smart_format resolveria isso, mas passa a escrever todos os valores
// e datas por extenso — pior para degravação. Corrigimos depois, pelo gênero da
// palavra seguinte. Medido em audiência real: WER 15,9% → 14,8%.

/** Terminam em -a mas são masculinos. */
const MASCULINOS_EM_A = new Set([
    "dia", "problema", "sistema", "mapa", "programa", "tema", "esquema",
    "telefonema", "dilema", "clima", "dogma", "dia",
]);

/** Terminam em -ão mas são femininos (os em -ção/-são já caem no sufixo). */
const FEMININOS_EM_AO = new Set(["questão", "razão", "mão", "ocasião"]);

const SUFIXOS_FEMININOS = /(ção|são|gem|dade|tude|ice)$/;

/** Decide "um" ou "uma" pelo gênero provável da palavra seguinte. */
function artigoIndefinido(proxima: string): "um" | "uma" {
    const p = proxima.toLowerCase().replace(/[^\p{L}]/gu, "");
    if (!p) return "um";
    if (MASCULINOS_EM_A.has(p)) return "um";
    if (FEMININOS_EM_AO.has(p) || SUFIXOS_FEMININOS.test(p)) return "uma";
    return /[aã]$/.test(p) ? "uma" : "um";
}

/**
 * Devolve o "1" isolado à forma de artigo. Só atua quando há uma palavra
 * logo em seguida, então sequências numéricas ("10 38 0 7", "403 e 26",
 * "10 dias") ficam intactas.
 */
function corrigirArtigoNoTexto(texto: string): string {
    return texto.replace(
        /(^|[\s(])1(\s+)(\p{L}+)/gu,
        (_m, antes: string, espaco: string, proxima: string) =>
            `${antes}${artigoIndefinido(proxima)}${espaco}${proxima}`
    );
}

/**
 * Mesma correção no array de words. Precisa acompanhar o texto: o editor
 * destaca palavra a palavra a partir daqui (ver src/hooks/use-time-sync.ts),
 * e divergir do transcript dessincronizaria o destaque.
 */
function corrigirArtigoNasWords<T extends { word: string }>(words: T[]): T[] {
    return words.map((w, i) => {
        if (w.word !== "1") return w;
        const proxima = words[i + 1]?.word ?? "";
        // sem palavra seguinte, ou seguida de outro número: é numeral mesmo
        if (!proxima || /^\d/.test(proxima)) return w;
        return { ...w, word: artigoIndefinido(proxima) };
    });
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
                text: corrigirArtigoNoTexto(transcript.trim()),
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
            text: corrigirArtigoNoTexto(utt.transcript.trim()),
            start_time: utt.start,
            end_time: utt.end,
            words: utt.words
                ? corrigirArtigoNasWords(utt.words).map((w) => ({
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
