import { NextResponse } from "next/server";
import { createClient } from "@deepgram/sdk";
import { createServerClient } from "@/lib/supabase-server";

/**
 * POST /api/transcribe
 * Body: { transcriptionId: string }
 *
 * 1. Busca a degravação no banco (pega media_url e glossary)
 * 2. Envia o áudio para Deepgram (nova-3, pt-BR, diarize, utterances)
 * 3. Salva as utterances no banco
 * 4. Atualiza o status para "formatting"
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

        // 2. Enviar para Deepgram
        const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);

        // Montar keywords do glossário
        const keywords = transcription.glossary
            ? transcription.glossary
                .split(/[\n,;]+/)
                .map((k: string) => k.trim())
                .filter(Boolean)
            : [];

        const { result, error: dgError } = await deepgram.listen.prerecorded.transcribeUrl(
            { url: transcription.media_url },
            {
                model: "nova-3",
                language: "pt-BR",
                diarize: true,
                smart_format: true,
                utterances: true,
                keywords: keywords.length > 0 ? keywords : undefined,
            }
        );

        if (dgError) {
            console.error("Deepgram error:", dgError);
            await supabase
                .from("transcriptions")
                .update({ status: "error", updated_at: new Date().toISOString() })
                .eq("id", transcriptionId);
            return NextResponse.json({ error: `Deepgram: ${dgError.message}` }, { status: 500 });
        }

        // 3. Mapear utterances e salvar no banco
        const dgUtterances = result?.results?.utterances ?? [];

        if (dgUtterances.length === 0) {
            // Fallback: se não retornou utterances, tenta extrair do channel
            const channel = result?.results?.channels?.[0];
            const alt = channel?.alternatives?.[0];
            if (alt?.transcript) {
                // Salva como utterance única
                await supabase.from("utterances").insert({
                    transcription_id: transcriptionId,
                    speaker_label: "SPEAKER_00",
                    text: alt.transcript,
                    start_time: 0,
                    end_time: alt.words?.[alt.words.length - 1]?.end ?? 0,
                    words: alt.words ? JSON.stringify(alt.words) : null,
                    sort_order: 0,
                });
            }
        } else {
            // Mapear cada utterance do Deepgram
            const utterancesToInsert = dgUtterances.map((utt: {
                speaker?: number;
                transcript: string;
                start: number;
                end: number;
                words?: Array<{ word: string; start: number; end: number; confidence: number; speaker?: number }>;
            }, idx: number) => ({
                transcription_id: transcriptionId,
                speaker_label: `SPEAKER_${String(utt.speaker ?? 0).padStart(2, "0")}`,
                text: utt.transcript,
                start_time: utt.start,
                end_time: utt.end,
                words: utt.words ? JSON.stringify(utt.words) : null,
                sort_order: idx,
            }));

            // Inserir em batch
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

        // 4. Atualizar status para formatting
        await supabase
            .from("transcriptions")
            .update({ status: "formatting", updated_at: new Date().toISOString() })
            .eq("id", transcriptionId);

        return NextResponse.json({
            success: true,
            utteranceCount: dgUtterances.length,
        });
    } catch (err) {
        console.error("Transcribe route error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Erro interno" },
            { status: 500 }
        );
    }
}
