import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * POST /api/transcribe
 * Body: { transcriptionId: string }
 *
 * 1. Busca a degravação no banco (pega media_url)
 * 2. Baixa o áudio do Supabase Storage
 * 3. Envia para Azure Whisper (segments com timestamps)
 * 4. Salva as utterances no banco
 * 5. Atualiza o status para "formatting"
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

        // 2. Baixar o áudio do Supabase Storage
        const audioResponse = await fetch(transcription.media_url);
        if (!audioResponse.ok) {
            throw new Error("Não foi possível baixar o áudio do Storage");
        }
        const audioBlob = await audioResponse.blob();

        // 3. Enviar para Azure Whisper
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
        const apiKey = process.env.AZURE_OPENAI_API_KEY!;
        const whisperUrl = `${endpoint}/openai/deployments/whisper/audio/transcriptions?api-version=2024-06-01`;

        const formData = new FormData();
        formData.append("file", audioBlob, "audio.mp3");
        formData.append("response_format", "verbose_json");
        formData.append("language", "pt");
        formData.append("timestamp_granularities[]", "segment");

        const whisperRes = await fetch(whisperUrl, {
            method: "POST",
            headers: {
                "api-key": apiKey,
            },
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

        // 4. Mapear segments e salvar no banco
        const segments: Array<{
            id: number;
            text: string;
            start: number;
            end: number;
        }> = whisperData.segments ?? [];

        if (segments.length === 0 && whisperData.text) {
            // Fallback: se não retornou segments, salva como utterance única
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
            // Mapear cada segment do Whisper
            // Whisper não faz diarização, então todos ficam como SPEAKER_00
            // O LLM na etapa de formatação tentará identificar os roles
            const utterancesToInsert = segments.map((seg, idx) => ({
                transcription_id: transcriptionId,
                speaker_label: "SPEAKER_00",
                text: seg.text.trim(),
                start_time: seg.start,
                end_time: seg.end,
                words: null,
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

        // 5. Atualizar status para formatting
        await supabase
            .from("transcriptions")
            .update({ status: "formatting", updated_at: new Date().toISOString() })
            .eq("id", transcriptionId);

        return NextResponse.json({
            success: true,
            segmentCount: segments.length,
            duration: whisperData.duration,
        });
    } catch (err) {
        console.error("Transcribe route error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Erro interno" },
            { status: 500 }
        );
    }
}
