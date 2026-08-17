import { writeFile, unlink, readFile } from "fs/promises";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
    TranscribeClient,
    StartTranscriptionJobCommand,
    GetTranscriptionJobCommand,
    DeleteTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";
import type { SupabaseClient } from "@supabase/supabase-js";

// O Transcribe em lote só lê áudio do S3, igual ao BatchRecognize do Chirp 3.
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_SPEAKERS = 6;

// ─── Formato do JSON de saída do Transcribe ──────────────────────────────────

interface AwsItem {
    type: "pronunciation" | "punctuation";
    start_time?: string;
    end_time?: string;
    speaker_label?: string;
    alternatives: Array<{ content: string; confidence?: string }>;
}

interface AwsSpeakerSegment {
    start_time: string;
    end_time: string;
    speaker_label: string;
    items?: Array<{ start_time: string; end_time: string; speaker_label: string }>;
}

interface AwsTranscript {
    results?: {
        transcripts?: Array<{ transcript: string }>;
        items?: AwsItem[];
        speaker_labels?: { speakers?: number; segments?: AwsSpeakerSegment[] };
    };
}

interface ParsedUtterance {
    speaker: string;
    text: string;
    start: number;
    end: number;
    words: Array<{ word: string; start: number; end: number; confidence: number; speaker: number }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(
            `${name} não configurado — o Amazon Transcribe precisa de AWS_REGION, ` +
            "AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY e AWS_S3_BUCKET."
        );
    }
    return value;
}

function awsConfig() {
    const region = requireEnv("AWS_REGION");
    return {
        region,
        credentials: {
            accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
            secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
        },
    };
}

// ─── Função principal ────────────────────────────────────────────────────────

export async function runAwsTranscription(
    transcriptionId: string,
    supabase: SupabaseClient
) {
    const updateProgress = async (progress: number, status?: string) => {
        const update: Record<string, unknown> = { progress, updated_at: new Date().toISOString() };
        if (status) update.status = status;
        await supabase.from("transcriptions").update(update).eq("id", transcriptionId);
    };

    // Falha cedo: sem credencial não adianta baixar e converter o vídeo antes.
    const bucket = requireEnv("AWS_S3_BUCKET");
    awsConfig();

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
    console.log("[AWS] Downloading media from:", transcription.media_url);
    const mediaResponse = await fetch(transcription.media_url);
    if (!mediaResponse.ok) throw new Error("Não foi possível baixar o arquivo do Storage");
    const mediaBuffer = Buffer.from(await mediaResponse.arrayBuffer());
    console.log(`[AWS] Downloaded: ${(mediaBuffer.length / 1024 / 1024).toFixed(1)}MB`);

    // 3. Converter para WAV mono 16kHz
    const urlPath = new URL(transcription.media_url).pathname;
    const ext = urlPath.split(".").pop()?.toLowerCase() ?? "";
    const tmpId = randomUUID();

    await updateProgress(25);
    console.log("[AWS] Converting to WAV (mono 16kHz)...");

    const inputPath = join(tmpdir(), `aws-input-${tmpId}.${ext || "mp4"}`);
    const outputPath = join(tmpdir(), `aws-output-${tmpId}.wav`);

    let audioBuffer: Buffer;

    try {
        await writeFile(inputPath, mediaBuffer);
        execSync(
            `ffmpeg -i "${inputPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 -y "${outputPath}"`,
            { timeout: 600000, stdio: "pipe" }
        );
        audioBuffer = await readFile(outputPath);
        console.log(`[AWS] Converted: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB WAV`);
    } finally {
        await unlink(inputPath).catch(() => { });
        await unlink(outputPath).catch(() => { });
    }

    // 4. Subir para o S3, transcrever e limpar
    await updateProgress(30);

    const objectKey = `${transcriptionId}/${tmpId}.wav`;
    const jobName = `dora2-${transcriptionId}-${tmpId}`.slice(0, 200);

    let allUtterances: ParsedUtterance[] = [];

    await uploadToS3(audioBuffer, bucket, objectKey);
    try {
        await updateProgress(35);
        const result = await runTranscriptionJob(jobName, bucket, objectKey, updateProgress);
        allUtterances = parseTranscript(result);
    } finally {
        await deleteFromS3(bucket, objectKey);
        await deleteJob(jobName);
    }

    await updateProgress(55);
    console.log(`[AWS] Total utterances: ${allUtterances.length}`);

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
            console.error("[AWS] Error inserting utterances:", insertError);
            throw new Error("Erro ao salvar falas");
        }
    }

    await updateProgress(65, "formatting");
}

// ─── S3 ──────────────────────────────────────────────────────────────────────

async function uploadToS3(audioBuffer: Buffer, bucket: string, key: string) {
    const s3 = new S3Client(awsConfig());
    console.log(`[AWS] Uploading ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB to s3://${bucket}/${key}`);

    try {
        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: audioBuffer,
            ContentType: "audio/wav",
        }));
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(
            `Falha ao enviar áudio para o S3: ${detail}. ` +
            "Confira se AWS_S3_BUCKET existe na região de AWS_REGION e se a chave tem permissão de s3:PutObject nele."
        );
    }
}

/** Limpeza best-effort: não vale derrubar uma transcrição já concluída. */
async function deleteFromS3(bucket: string, key: string) {
    try {
        const s3 = new S3Client(awsConfig());
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
        console.error("[AWS] Falha ao limpar objeto do S3:", err);
    }
}

async function deleteJob(jobName: string) {
    try {
        const client = new TranscribeClient(awsConfig());
        await client.send(new DeleteTranscriptionJobCommand({ TranscriptionJobName: jobName }));
    } catch (err) {
        console.error("[AWS] Falha ao remover o job:", err);
    }
}

// ─── Transcribe ──────────────────────────────────────────────────────────────

async function runTranscriptionJob(
    jobName: string,
    bucket: string,
    key: string,
    updateProgress: (progress: number, status?: string) => Promise<void>
): Promise<AwsTranscript> {
    const client = new TranscribeClient(awsConfig());

    console.log(`[AWS] StartTranscriptionJob ${jobName}...`);

    try {
        await client.send(new StartTranscriptionJobCommand({
            TranscriptionJobName: jobName,
            LanguageCode: "pt-BR",
            MediaFormat: "wav",
            Media: { MediaFileUri: `s3://${bucket}/${key}` },
            Settings: {
                // Diarização acústica nativa — o motivo de trazer a AWS para a comparação.
                ShowSpeakerLabels: true,
                MaxSpeakerLabels: MAX_SPEAKERS,
            },
        }));
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Amazon Transcribe recusou o job: ${detail}`);
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;

    for (;;) {
        if (Date.now() > deadline) {
            throw new Error("Amazon Transcribe: transcrição excedeu 30 min sem concluir");
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        const { TranscriptionJob: job } = await client.send(
            new GetTranscriptionJobCommand({ TranscriptionJobName: jobName })
        );

        const status = job?.TranscriptionJobStatus;

        if (status === "FAILED") {
            throw new Error(`Amazon Transcribe falhou: ${job?.FailureReason ?? "motivo não informado"}`);
        }

        if (status === "COMPLETED") {
            const uri = job?.Transcript?.TranscriptFileUri;
            if (!uri) throw new Error("Amazon Transcribe concluiu sem devolver o transcript");

            const res = await fetch(uri);
            if (!res.ok) {
                throw new Error(`Não foi possível baixar o transcript do Transcribe (${res.status})`);
            }
            const data: AwsTranscript = await res.json();
            console.log(`[AWS] OK — items: ${data.results?.items?.length ?? 0}`);
            return data;
        }

        // Progresso do bloco de transcrição: 35 → 54
        const elapsed = POLL_TIMEOUT_MS - (deadline - Date.now());
        await updateProgress(35 + Math.min(19, Math.round(elapsed / 30000)));
    }
}

// ─── Parse com diarização ────────────────────────────────────────────────────

function parseTranscript(data: AwsTranscript): ParsedUtterance[] {
    const items = data.results?.items ?? [];
    if (items.length === 0) return [];

    // O Transcribe devolve o locutor numa lista separada, indexada por start_time.
    const speakerByStart = new Map<string, string>();
    for (const segment of data.results?.speaker_labels?.segments ?? []) {
        for (const it of segment.items ?? []) {
            speakerByStart.set(it.start_time, it.speaker_label);
        }
    }

    // Rótulos vêm como "spk_0", "spk_1" — normalizamos para 0..n-1.
    const speakerIndex = new Map<string, number>();
    [...new Set(speakerByStart.values())]
        .sort((a, b) => (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0))
        .forEach((label, idx) => speakerIndex.set(label, idx));

    const utterances: ParsedUtterance[] = [];
    let current: ParsedUtterance | null = null;

    for (const item of items) {
        const content = item.alternatives?.[0]?.content;
        if (!content) continue;

        // Pontuação não tem tempo nem locutor: cola na palavra anterior.
        if (item.type === "punctuation") {
            if (current) current.text += content;
            continue;
        }

        const start = parseFloat(item.start_time ?? "0");
        const end = parseFloat(item.end_time ?? "0");
        const rawSpeaker = speakerByStart.get(item.start_time ?? "") ?? "spk_0";
        const speakerNum = speakerIndex.get(rawSpeaker) ?? 0;
        const label = `SPEAKER_${String(speakerNum).padStart(2, "0")}`;

        if (!current || current.speaker !== label) {
            if (current) utterances.push(current);
            current = { speaker: label, text: content, start, end, words: [] };
        } else {
            current.text += " " + content;
            current.end = end;
        }

        current.words.push({
            word: content,
            start,
            end,
            confidence: parseFloat(item.alternatives[0].confidence ?? "0"),
            speaker: speakerNum,
        });
    }

    if (current) utterances.push(current);
    return utterances;
}
