/**
 * Cores de speakers compartilhadas entre PDF e DOCX exports.
 * RGB é usado pelo jsPDF; HEX é usado pelo docx.
 */

export const SPEAKER_COLORS_RGB: Record<string, [number, number, number]> = {
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

// HEX (sem #) para uso no docx
export const SPEAKER_COLORS_HEX: Record<string, string> = {
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

export function getSpeakerColorRgb(label: string): [number, number, number] {
    return SPEAKER_COLORS_RGB[label] ?? [153, 27, 27];
}

export function getSpeakerColorHex(label: string): string {
    return SPEAKER_COLORS_HEX[label] ?? "991B1B";
}
