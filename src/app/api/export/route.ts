import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    AlignmentType,
    BorderStyle,
    Header,
    Footer,
    PageNumber,
} from "docx";
import type { Utterance } from "@/lib/types";

// Cores por tipo de locutor (hex para docx)
const SPEAKER_COLORS: Record<string, string> = {
    "JUIZ(A)": "B45309",
    "ADV. AUTOR": "1D4ED8",
    "ADV. RÉU": "BE123C",
    "PROMOTOR(A)": "1D4ED8",
    "DEFENSOR(A)": "BE123C",
    "TESTEMUNHA": "7C3AED",
    "DEPOENTE": "7C3AED",
    "RÉU": "EA580C",
    "AUTOR": "0891B2",
    "ESCRIVÃO(Ã)": "4B5563",
};

function getSpeakerColor(label: string): string {
    return SPEAKER_COLORS[label] ?? "991B1B";
}

function formatTimestamp(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const transcriptionId = searchParams.get("id");

    if (!transcriptionId) {
        return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    const supabase = await createServerClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // Buscar a transcrição
    const { data: transcription, error: tError } = await supabase
        .from("transcriptions")
        .select("*")
        .eq("id", transcriptionId)
        .eq("user_id", user.id)
        .single();

    if (tError || !transcription) {
        return NextResponse.json({ error: "Degravação não encontrada" }, { status: 404 });
    }

    // Buscar as utterances
    const { data: utterances } = await supabase
        .from("utterances")
        .select("*")
        .eq("transcription_id", transcriptionId)
        .order("sort_order", { ascending: true })
        .returns<Utterance[]>();

    const items = utterances ?? [];

    // Construir o documento DOCX
    const paragraphs: Paragraph[] = [];

    // Título
    paragraphs.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: "DEGRAVAÇÃO DE AUDIÊNCIA",
                    bold: true,
                    size: 32,
                    color: "1a1a2e",
                    font: "Arial",
                }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
        })
    );

    // Subtítulo com processo
    paragraphs.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: transcription.title,
                    bold: true,
                    size: 24,
                    color: "374151",
                    font: "Arial",
                }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 50 },
        })
    );

    // Data
    paragraphs.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: `Data: ${formatDate(transcription.created_at)}`,
                    size: 20,
                    color: "6B7280",
                    font: "Arial",
                    italics: true,
                }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
        })
    );

    // Linha separadora
    paragraphs.push(
        new Paragraph({
            border: {
                bottom: {
                    color: "D1D5DB",
                    size: 1,
                    style: BorderStyle.SINGLE,
                    space: 1,
                },
            },
            spacing: { after: 300 },
        })
    );

    // Conteúdo — agrupar falas por locutor
    let lastSpeaker = "";

    for (const utterance of items) {
        const isNewSpeaker = utterance.speaker_label !== lastSpeaker;
        lastSpeaker = utterance.speaker_label;

        if (isNewSpeaker) {
            // Espaço antes de novo locutor (exceto primeiro)
            if (paragraphs.length > 4) {
                paragraphs.push(new Paragraph({ spacing: { before: 200 } }));
            }

            // Label do locutor
            paragraphs.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: utterance.speaker_label,
                            bold: true,
                            size: 22,
                            color: getSpeakerColor(utterance.speaker_label),
                            font: "Arial",
                        }),
                        new TextRun({
                            text: `  [${formatTimestamp(utterance.start_time)}]`,
                            size: 18,
                            color: "9CA3AF",
                            font: "Arial",
                        }),
                    ],
                    spacing: { after: 60 },
                    border: {
                        bottom: {
                            color: "E5E7EB",
                            size: 1,
                            style: BorderStyle.SINGLE,
                            space: 1,
                        },
                    },
                })
            );
        }

        // Texto da fala
        paragraphs.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: utterance.text,
                        size: 22,
                        color: "374151",
                        font: "Arial",
                    }),
                ],
                spacing: { before: 40, after: 40, line: 360 },
                indent: { left: 280 },
            })
        );
    }

    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: 1440,
                            right: 1440,
                            bottom: 1440,
                            left: 1440,
                        },
                        size: {
                            width: 12240,
                            height: 15840,
                        },
                    },
                },
                headers: {
                    default: new Header({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: `Transcritor TJMG — ${transcription.title}`,
                                        size: 16,
                                        color: "9CA3AF",
                                        font: "Arial",
                                        italics: true,
                                    }),
                                ],
                                alignment: AlignmentType.RIGHT,
                            }),
                        ],
                    }),
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: "Página ",
                                        size: 16,
                                        color: "9CA3AF",
                                        font: "Arial",
                                    }),
                                    new TextRun({
                                        children: [PageNumber.CURRENT],
                                        size: 16,
                                        color: "9CA3AF",
                                        font: "Arial",
                                    }),
                                ],
                                alignment: AlignmentType.CENTER,
                            }),
                        ],
                    }),
                },
                children: paragraphs,
            },
        ],
    });

    const buffer = await Packer.toBuffer(doc);

    // Sanitizar nome do arquivo
    const safeTitle = transcription.title
        .replace(/[^a-zA-Z0-9À-ÿ\s.-]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 80);

    return new NextResponse(new Uint8Array(buffer), {
        headers: {
            "Content-Type":
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${safeTitle}_degravacao.docx"`,
        },
    });
}
