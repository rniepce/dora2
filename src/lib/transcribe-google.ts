import { writeFile, unlink, readFile } from "fs/promises";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { GoogleAuth } from "google-auth-library";
import type { SupabaseClient } from "@supabase/supabase-js";

const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"]);
const REGION = "us"; // chirp_3 está em GA nas multi-regiões "us" e "eu"

// WAV PCM 16 kHz mono 16-bit
const BYTES_PER_SEC = 32000;

// O método síncrono Recognize aceita no máximo 60 s de áudio. Audiências são
// muito mais longas, então usamos BatchRecognize — que aceita até 8 h, mas só
// lê o áudio de um bucket do Cloud Storage.
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 30 * 60 * 1000;

// ─── Tipos de resposta da API ────────────────────────────────────────────────

interface GoogleWordInfo {
    startOffset?: string;  // "1.500s"
    endOffset?: string;
    word: string;
    confidence?: number;
    speakerLabel?: string; // chirp_3 numera a partir de "0"
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

interface GoogleOperation {
    name?: string;
    done?: boolean;
    error?: { code?: number; message?: string };
    response?: {
        results?: Record<string, { transcript?: GoogleRecognizeResponse; error?: { message?: string } }>;
    };
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

    // 4. Transcrever — o áudio inteiro em uma única chamada BatchRecognize, o que
    //    mantém a diarização consistente do começo ao fim da audiência.
    await updateProgress(30);

    const estimatedDurationSec = audioBuffer.length / BYTES_PER_SEC;
    console.log(`[Google] Estimated duration: ${estimatedDurationSec.toFixed(0)}s`);

    const objectName = `${transcriptionId}/${tmpId}.wav`;
    let allUtterances: ReturnType<typeof parseResults> = [];

    await uploadToGcs(audioBuffer, objectName);
    try {
        await updateProgress(35);
        const results = await callGoogleBatchRecognize(objectName, updateProgress);
        allUtterances = parseResults(results, 0, estimatedDurationSec);
    } finally {
        await deleteFromGcs(objectName);
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

/**
 * A API Speech-to-Text v2 (única com Chirp 3) exige credenciais OAuth2 — chave
 * de API é rejeitada com IAM_PERMISSION_DENIED, porque uma API key não carrega
 * identidade IAM. Aceitamos o JSON da conta de serviço inline (prático no
 * Railway) ou qualquer credencial padrão do ambiente (ADC).
 */
let cachedAuth: GoogleAuth | null = null;

function getGoogleAuth(): GoogleAuth {
    if (cachedAuth) return cachedAuth;

    const scopes = ["https://www.googleapis.com/auth/cloud-platform"];
    const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (rawCredentials) {
        let credentials;
        try {
            credentials = JSON.parse(rawCredentials);
        } catch {
            throw new Error(
                "GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido — cole o conteúdo completo da chave da conta de serviço"
            );
        }
        cachedAuth = new GoogleAuth({ credentials, scopes });
    } else {
        // GOOGLE_APPLICATION_CREDENTIALS ou credenciais do ambiente
        cachedAuth = new GoogleAuth({ scopes });
    }

    return cachedAuth;
}

async function getAccessToken(): Promise<string> {
    try {
        const client = await getGoogleAuth().getClient();
        const { token } = await client.getAccessToken();
        if (!token) throw new Error("token vazio");
        return token;
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(
            `Não foi possível autenticar no Google Cloud: ${detail}. ` +
            "O Chirp 3 usa a API Speech-to-Text v2, que não aceita chave de API — " +
            "configure GOOGLE_SERVICE_ACCOUNT_JSON com a chave de uma conta de serviço que tenha o papel roles/speech.client."
        );
    }
}

const GCS_BUCKET_ENV = "GOOGLE_CLOUD_STORAGE_BUCKET";

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} não configurado`);
    return value;
}

/** Sobe o WAV para o bucket — o BatchRecognize só lê áudio do Cloud Storage. */
async function uploadToGcs(audioBuffer: Buffer, objectName: string): Promise<void> {
    const bucket = requireEnv(GCS_BUCKET_ENV);
    const accessToken = await getAccessToken();

    const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o` +
        `?uploadType=media&name=${encodeURIComponent(objectName)}`;

    console.log(`[Google] Uploading ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB to gs://${bucket}/${objectName}`);

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "audio/wav",
            "Content-Length": String(audioBuffer.length),
            Authorization: `Bearer ${accessToken}`,
        },
        body: new Uint8Array(audioBuffer),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
            `Falha ao enviar áudio para o Cloud Storage (${res.status}): ${errorText.substring(0, 300)}. ` +
            `Confira se ${GCS_BUCKET_ENV} existe e se a conta de serviço tem roles/storage.objectAdmin nele.`
        );
    }
}

/** Remove o áudio temporário do bucket — não guardamos mídia de audiência lá. */
async function deleteFromGcs(objectName: string): Promise<void> {
    try {
        const bucket = requireEnv(GCS_BUCKET_ENV);
        const accessToken = await getAccessToken();
        await fetch(
            `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
        );
    } catch (err) {
        // Limpeza é best-effort: não vale derrubar a transcrição já concluída.
        console.error("[Google] Falha ao limpar objeto do GCS:", err);
    }
}

async function callGoogleBatchRecognize(
    objectName: string,
    updateProgress: (progress: number, status?: string) => Promise<void>
): Promise<GoogleRecognizeResponse> {
    const projectId = requireEnv("GOOGLE_CLOUD_PROJECT_ID");
    const bucket = requireEnv(GCS_BUCKET_ENV);
    const gcsUri = `gs://${bucket}/${objectName}`;
    const accessToken = await getAccessToken();

    const baseUrl = `https://${REGION}-speech.googleapis.com/v2`;
    const batchUrl = `${baseUrl}/projects/${projectId}/locations/${REGION}/recognizers/_:batchRecognize`;

    // chirp_3 não suporta enableWordTimeOffsets nem enableWordConfidence —
    // pedi-los faz a API recusar a requisição. A diarização precisa de faixa
    // explícita de locutores.
    const requestBody = {
        config: {
            autoDecodingConfig: {},
            languageCodes: ["pt-BR"],
            model: "chirp_3",
            features: {
                diarizationConfig: { minSpeakerCount: 1, maxSpeakerCount: 6 },
            },
        },
        files: [{ uri: gcsUri }],
        recognitionOutputConfig: { inlineResponseConfig: {} },
    };

    console.log(`[Google] BatchRecognize on ${gcsUri}...`);

    const res = await fetch(batchUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            "x-goog-user-project": projectId,
        },
        body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error("[Google] API error:", res.status, errorText);
        throw new Error(`Google Speech API ${res.status}: ${errorText.substring(0, 300)}`);
    }

    const operation: GoogleOperation = await res.json();
    if (!operation.name) throw new Error("Google Speech API não devolveu uma operação");

    // A operação é assíncrona: consultamos até terminar.
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let done: GoogleOperation = operation;

    while (!done.done) {
        if (Date.now() > deadline) {
            throw new Error("Google Speech API: transcrição excedeu 30 min sem concluir");
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        const pollToken = await getAccessToken();
        const pollRes = await fetch(`${baseUrl}/${operation.name}`, {
            headers: { Authorization: `Bearer ${pollToken}`, "x-goog-user-project": projectId },
        });

        if (!pollRes.ok) {
            const errorText = await pollRes.text();
            throw new Error(`Google Speech API ${pollRes.status} ao consultar operação: ${errorText.substring(0, 300)}`);
        }

        done = await pollRes.json();

        // Progresso do bloco de transcrição: 35 → 55
        const elapsed = POLL_TIMEOUT_MS - (deadline - Date.now());
        await updateProgress(35 + Math.min(19, Math.round(elapsed / 30000)));
    }

    if (done.error) {
        throw new Error(`Google Speech API: ${done.error.message ?? "erro desconhecido na operação"}`);
    }

    const fileResult = done.response?.results?.[gcsUri];
    if (fileResult?.error) {
        throw new Error(`Google Speech API: ${fileResult.error.message ?? "erro ao processar o áudio"}`);
    }

    const transcript = fileResult?.transcript ?? {};
    console.log(`[Google] OK — results: ${transcript.results?.length ?? 0}`);
    return transcript;
}

// ─── Parse de resultados com diarização ──────────────────────────────────────

function parseResults(
    response: GoogleRecognizeResponse,
    timeOffset: number,
    chunkDuration: number
): Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
    words: Array<{ word: string; start: number; end: number; confidence: number; speaker: number }>;
}> {
    const results = response.results ?? [];
    if (results.length === 0) return [];

    // Coletar as words cruas — o Chirp 3 devolve apenas `word` e `speakerLabel`,
    // sem startOffset/endOffset.
    const rawWords: Array<{ word: string; startOffset?: string; endOffset?: string; speakerLabel: string }> = [];

    for (const result of results) {
        const alt = result.alternatives?.[0];
        if (!alt?.words) continue;

        for (const w of alt.words) {
            rawWords.push({
                word: w.word,
                startOffset: w.startOffset,
                endOffset: w.endOffset,
                speakerLabel: w.speakerLabel ?? "0",
            });
        }
    }

    // Sem timestamps por palavra, distribuímos a duração do trecho igualmente
    // entre as palavras. É aproximado, mas mantém a linha do tempo monotônica e
    // utilizável — sem isso todas as falas ficariam em 0s.
    const hasOffsets = rawWords.some((w) => w.startOffset != null);
    const perWord = rawWords.length > 0 && chunkDuration > 0 ? chunkDuration / rawWords.length : 0;

    const allWords = rawWords.map((w, i) => ({
        word: w.word,
        start: hasOffsets ? parseDuration(w.startOffset) + timeOffset : timeOffset + i * perWord,
        end: hasOffsets ? parseDuration(w.endOffset) + timeOffset : timeOffset + (i + 1) * perWord,
        confidence: 0, // chirp_3 não devolve confiança por palavra
        speakerLabel: w.speakerLabel,
    }));

    if (allWords.length === 0) {
        // Sem words: só o transcript de cada trecho. Repartimos a duração do
        // trecho proporcionalmente ao tamanho de cada transcript.
        const spoken = results
            .map((r) => r.alternatives?.[0]?.transcript?.trim() ?? "")
            .filter((t) => t.length > 0);

        const totalChars = spoken.reduce((sum, t) => sum + t.length, 0);
        let cursor = timeOffset;

        return spoken.map((text) => {
            const share = totalChars > 0 ? (text.length / totalChars) * chunkDuration : 0;
            const start = cursor;
            cursor += share;
            return {
                speaker: "SPEAKER_00",
                text,
                start,
                end: cursor,
                words: [] as Array<{ word: string; start: number; end: number; confidence: number; speaker: number }>,
            };
        });
    }

    // O Chirp 3 numera os locutores a partir de "0", mas outros modelos usam "1".
    // Normalizamos os rótulos distintos para 0..n-1 para não fundir locutores.
    const speakerIndex = new Map<string, number>();
    [...new Set(allWords.map((w) => w.speakerLabel))]
        .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
        .forEach((label, idx) => speakerIndex.set(label, idx));

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
            utterances.push(buildUtterance(currentSpeaker, currentWords, speakerIndex));
            currentSpeaker = w.speakerLabel;
            currentWords = [w];
        }
    }
    // Flush last utterance
    utterances.push(buildUtterance(currentSpeaker, currentWords, speakerIndex));

    return utterances;
}

function buildUtterance(
    speakerLabel: string,
    words: Array<{ word: string; start: number; end: number; confidence: number; speakerLabel: string }>,
    speakerIndex: Map<string, number>
) {
    const speakerNum = speakerIndex.get(speakerLabel) ?? 0;
    const label = `SPEAKER_${String(speakerNum).padStart(2, "0")}`;

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
            speaker: speakerIndex.get(w.speakerLabel) ?? 0,
        })),
    };
}
