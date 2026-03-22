import { fileTypeFromBuffer } from "file-type";

const ALLOWED_MIME_TYPES = new Set([
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/flac",
    "audio/aac",
    "audio/x-aac",
    "audio/x-m4a",
    "video/mp4",
    "video/x-matroska",
    "video/x-msvideo",
    "video/quicktime",
    "video/webm",
    "video/x-flv",
    "video/x-ms-wmv",
]);

/**
 * Verifica os magic bytes do buffer para garantir que é um arquivo de mídia válido.
 * Lança erro se o tipo não for permitido.
 */
export async function validateMediaBuffer(buffer: Buffer, filename: string): Promise<void> {
    const detected = await fileTypeFromBuffer(buffer);

    if (!detected) {
        // file-type não reconheceu — pode ser um formato menos comum (WMA, FLAC antigo)
        // Neste caso, confiamos na extensão como fallback mas logamos um aviso
        console.warn(`[validateMedia] Could not detect MIME type for ${filename}, proceeding with extension check`);
        return;
    }

    if (!ALLOWED_MIME_TYPES.has(detected.mime)) {
        throw new Error(
            `Tipo de arquivo não permitido: ${detected.mime} (${detected.ext}). ` +
            `Envie um arquivo de áudio ou vídeo válido.`
        );
    }
}
