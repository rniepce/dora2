import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { jsPDF } from "jspdf";
import type { Utterance } from "@/lib/types";

// Cores por tipo de locutor (RGB)
const SPEAKER_COLORS: Record<string, [number, number, number]> = {
    "JUIZ(A)": [180, 83, 9],
    "ADV. AUTOR": [29, 78, 216],
    "ADV. RÉU": [190, 18, 60],
    "PROMOTOR(A)": [29, 78, 216],
    "DEFENSOR(A)": [190, 18, 60],
    "TESTEMUNHA": [124, 58, 237],
    "DEPOENTE": [124, 58, 237],
    "RÉU": [234, 88, 12],
    "AUTOR": [8, 145, 178],
    "ESCRIVÃO(Ã)": [75, 85, 99],
};

function getSpeakerColor(label: string): [number, number, number] {
    return SPEAKER_COLORS[label] ?? [153, 27, 27];
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

    const { data: transcription, error: tError } = await supabase
        .from("transcriptions")
        .select("*")
        .eq("id", transcriptionId)
        .eq("user_id", user.id)
        .single();

    if (tError || !transcription) {
        return NextResponse.json({ error: "Degravação não encontrada" }, { status: 404 });
    }

    const { data: utterances } = await supabase
        .from("utterances")
        .select("*")
        .eq("transcription_id", transcriptionId)
        .order("sort_order", { ascending: true })
        .returns<Utterance[]>();

    const items = utterances ?? [];

    // Construir PDF
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 20;
    const marginRight = 20;
    const marginTop = 25;
    const marginBottom = 20;
    const textWidth = pageWidth - marginLeft - marginRight;
    let y = marginTop;

    // Helper: adicionar rodapé em cada página
    function addFooter() {
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(156, 163, 175);
            doc.text(
                `Transcritor TJMG — ${transcription.title}`,
                marginLeft,
                pageHeight - 10
            );
            doc.text(
                `Página ${i} de ${pageCount}`,
                pageWidth - marginRight,
                pageHeight - 10,
                { align: "right" }
            );
        }
    }

    // Helper: verificar e adicionar nova página
    function checkPageBreak(neededHeight: number) {
        if (y + neededHeight > pageHeight - marginBottom) {
            doc.addPage();
            y = marginTop;
        }
    }

    // ─── Título ───
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 26, 46);
    doc.text("DEGRAVAÇÃO DE AUDIÊNCIA", pageWidth / 2, y, { align: "center" });
    y += 10;

    // Subtítulo (processo)
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text(transcription.title, pageWidth / 2, y, { align: "center" });
    y += 7;

    // Data
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(107, 114, 128);
    doc.text(`Data: ${formatDate(transcription.created_at)}`, pageWidth / 2, y, { align: "center" });
    y += 8;

    // Linha separadora
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 10;

    // ─── Conteúdo ───
    let lastSpeaker = "";

    for (const utterance of items) {
        const isNewSpeaker = utterance.speaker_label !== lastSpeaker;
        lastSpeaker = utterance.speaker_label;

        if (isNewSpeaker) {
            checkPageBreak(12);

            // Espaço antes de novo locutor
            y += 4;

            // Label do locutor
            const speakerColor = getSpeakerColor(utterance.speaker_label);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(speakerColor[0], speakerColor[1], speakerColor[2]);

            // Barra colorida lateral
            doc.setFillColor(speakerColor[0], speakerColor[1], speakerColor[2]);
            doc.rect(marginLeft, y - 3.5, 1.5, 4, "F");

            doc.text(utterance.speaker_label, marginLeft + 4, y);

            // Timestamp
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(156, 163, 175);
            const tsText = `[${formatTimestamp(utterance.start_time)}]`;
            doc.text(tsText, pageWidth - marginRight, y, { align: "right" });

            y += 2;

            // Linha sutil abaixo do speaker
            doc.setDrawColor(229, 231, 235);
            doc.setLineWidth(0.15);
            doc.line(marginLeft, y, pageWidth - marginRight, y);
            y += 4;
        }

        // Texto da fala
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 65, 81);

        const lines = doc.splitTextToSize(utterance.text, textWidth - 6);
        const lineHeight = 5;
        const blockHeight = lines.length * lineHeight;

        checkPageBreak(blockHeight);

        doc.text(lines, marginLeft + 5, y);
        y += blockHeight + 2;
    }

    // Adicionar rodapé em todas as páginas
    addFooter();

    const pdfBuffer = doc.output("arraybuffer");

    const safeTitle = transcription.title
        .replace(/[^a-zA-Z0-9À-ÿ\s.-]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 80);

    return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${safeTitle}_degravacao.pdf"`,
        },
    });
}
