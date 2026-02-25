"use client";

import { useState, useRef, useCallback } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

export type FFmpegStatus =
    | "idle"
    | "loading"
    | "ready"
    | "extracting"
    | "done"
    | "error";

interface UseFFmpegReturn {
    status: FFmpegStatus;
    progress: number;
    logs: string[];
    error: string | null;
    load: () => Promise<void>;
    extractAudio: (file: File) => Promise<Blob | null>;
}

export function useFFmpeg(): UseFFmpegReturn {
    const ffmpegRef = useRef<FFmpeg | null>(null);
    const [status, setStatus] = useState<FFmpegStatus>("idle");
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (ffmpegRef.current) return; // já carregado

        try {
            setStatus("loading");
            setProgress(0);

            const ffmpeg = new FFmpeg();

            ffmpeg.on("log", ({ message }) => {
                setLogs((prev) => [...prev.slice(-50), message]);
            });

            ffmpeg.on("progress", ({ progress: p }) => {
                setProgress(Math.round(p * 100));
            });

            // Carrega os binários do FFmpeg via CDN
            const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
            await ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
            });

            ffmpegRef.current = ffmpeg;
            setStatus("ready");
        } catch (err) {
            console.error("FFmpeg load error:", err);
            setError(err instanceof Error ? err.message : "Erro ao carregar FFmpeg");
            setStatus("error");
        }
    }, []);

    const extractAudio = useCallback(async (file: File): Promise<Blob | null> => {
        const ffmpeg = ffmpegRef.current;
        if (!ffmpeg) {
            setError("FFmpeg não está carregado");
            return null;
        }

        try {
            setStatus("extracting");
            setProgress(0);

            // Escreve o arquivo de vídeo na memória do FFmpeg
            const inputFileName = "input" + getExtension(file.name);
            const arrayBuffer = await file.arrayBuffer();
            await ffmpeg.writeFile(inputFileName, new Uint8Array(arrayBuffer));

            // Extrai áudio: MP3, 16kHz, mono (otimizado para STT)
            await ffmpeg.exec([
                "-i", inputFileName,
                "-vn",                // Remove vídeo
                "-acodec", "libmp3lame",
                "-ar", "16000",       // 16kHz sample rate (ideal para Deepgram)
                "-ac", "1",           // Mono
                "-b:a", "64k",        // Bitrate baixo para economia de banda
                "output.mp3",
            ]);

            // Lê o arquivo de áudio extraído
            const data = (await ffmpeg.readFile("output.mp3")) as Uint8Array;

            // Limpa os arquivos da memória
            await ffmpeg.deleteFile(inputFileName);
            await ffmpeg.deleteFile("output.mp3");

            const audioBlob = new Blob([new Uint8Array(data.buffer).buffer as ArrayBuffer], { type: "audio/mpeg" });
            setStatus("done");
            setProgress(100);

            return audioBlob;
        } catch (err) {
            console.error("Audio extraction error:", err);
            setError(
                err instanceof Error ? err.message : "Erro ao extrair áudio"
            );
            setStatus("error");
            return null;
        }
    }, []);

    return { status, progress, logs, error, load, extractAudio };
}

function getExtension(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (!ext) return ".mp4";
    return `.${ext}`;
}
