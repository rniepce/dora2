"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    Upload,
    FileVideo,
    Music,
    Loader2,
    CheckCircle2,
    AlertCircle,
    ArrowLeft,
    X,
    Mic,
    AudioLines,
    Globe,
    Cloud,
} from "lucide-react";
import { toast } from "sonner";
import * as tus from "tus-js-client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

import { createTranscriptionAction, updateTranscriptionMediaUrl } from "@/lib/actions/transcription";
import { createClient } from "@/lib/supabase";

const ACCEPTED_VIDEO = ".mp4,.mkv,.avi,.mov,.webm,.flv,.wmv";
const ACCEPTED_AUDIO = ".mp3,.wav,.ogg,.m4a,.aac,.flac,.wma";
const ACCEPTED_ALL = `${ACCEPTED_VIDEO},${ACCEPTED_AUDIO}`;

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac", "wma"]);
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB — deve ser igual ao limite do bucket Supabase

function isAudioFile(filename: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return AUDIO_EXTENSIONS.has(ext);
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function NewTranscriptionPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form
    const [title, setTitle] = useState("");
    const [glossary, setGlossary] = useState("");
    const [engine, setEngine] = useState<"whisper" | "deepgram" | "google" | "aws">("deepgram");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Pipeline
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDone, setIsDone] = useState(false);
    const [isError, setIsError] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // Progress (real-time via polling)
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState("");
    const [transcriptionId, setTranscriptionId] = useState<string | null>(null);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ─── Polling para progresso real ────────────────────────────────────────
    useEffect(() => {
        if (!transcriptionId || isDone || isError) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            return;
        }

        const poll = async () => {
            try {
                const res = await fetch(`/api/status/${transcriptionId}`);
                if (!res.ok) return;
                const data = await res.json();
                setProgress(data.progress);
                setProgressLabel(data.label);

                if (data.status === "completed") {
                    setIsDone(true);
                    setIsProcessing(false);
                    setProgress(100);
                    setProgressLabel("Concluído!");
                    toast.success("Degravação concluída!");
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    setTimeout(() => {
                        router.push("/dashboard");
                        router.refresh();
                    }, 2000);
                } else if (data.status === "error") {
                    setIsError(true);
                    setIsProcessing(false);
                    setProgressLabel("Erro no processamento");
                    if (data.errorMessage) setErrorMsg(data.errorMessage);
                    if (pollingRef.current) clearInterval(pollingRef.current);
                }
            } catch { /* ignore polling errors */ }
        };

        pollingRef.current = setInterval(poll, 2000);
        poll(); // primeira chamada imediata

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [transcriptionId, isDone, isError, router]);

    // ─── File selection ──────────────────────────────────────────────────────
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > MAX_FILE_SIZE) {
                toast.error("Arquivo muito grande", {
                    description: `O tamanho máximo permitido é ${formatBytes(MAX_FILE_SIZE)}. Seu arquivo tem ${formatBytes(file.size)}.`,
                });
                if (fileInputRef.current) fileInputRef.current.value = "";
                return;
            }
            setSelectedFile(file);
        }
    }, []);

    const clearFile = useCallback(() => {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    // ─── Submit ─────────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (!selectedFile || !title.trim()) {
            toast.error("Preencha o título e selecione um arquivo.");
            return;
        }

        try {
            setIsProcessing(true);
            setProgress(5);
            setProgressLabel("Criando registro...");

            // 1. Criar registro
            const result = await createTranscriptionAction({
                title: title.trim(),
                glossary: glossary.trim() || null,
                engine,
            });

            if (result.error || !result.id) {
                throw new Error(result.error || "Erro ao criar degravação.");
            }

            setTranscriptionId(result.id);
            setProgress(8);
            setProgressLabel("Enviando arquivo...");

            // 2. Upload resumível (TUS) para Supabase Storage — suporta arquivos grandes
            const supabase = createClient();
            const ext = selectedFile.name.split(".").pop()?.toLowerCase() ?? "mp3";
            const filePath = `${result.id}/media.${ext}`;
            const bucketName = "media";

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
            const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

            await new Promise<void>((resolve, reject) => {
                const upload = new tus.Upload(selectedFile, {
                    endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
                    retryDelays: [0, 1000, 3000, 5000],
                    headers: {
                        authorization: `Bearer ${supabaseKey}`,
                        "x-upsert": "true",
                    },
                    uploadDataDuringCreation: true,
                    removeFingerprintOnSuccess: true,
                    metadata: {
                        bucketName,
                        objectName: filePath,
                        contentType: selectedFile.type || "audio/mpeg",
                    },
                    chunkSize: 6 * 1024 * 1024, // 6 MB por chunk
                    onError: (error) => {
                        reject(new Error(`Upload falhou: ${error.message}`));
                    },
                    onProgress: (bytesUploaded, bytesTotal) => {
                        const pct = Math.round((bytesUploaded / bytesTotal) * 100);
                        // Mapear 0-100% do upload para 8-12% do progresso geral
                        const mappedProgress = 8 + Math.round((pct / 100) * 4);
                        setProgress(mappedProgress);
                        setProgressLabel(`Enviando arquivo... ${pct}%`);
                    },
                    onSuccess: () => {
                        resolve();
                    },
                });

                // Verificar uploads anteriores incompletos
                upload.findPreviousUploads().then((previousUploads) => {
                    if (previousUploads.length) {
                        upload.resumeFromPreviousUpload(previousUploads[0]);
                    }
                    upload.start();
                });
            });

            setProgress(12);
            setProgressLabel("Iniciando processamento...");

            // 3. Pegar URL pública e atualizar registro
            const { data: urlData } = supabase.storage
                .from("media")
                .getPublicUrl(filePath);

            const updateResult = await updateTranscriptionMediaUrl(
                result.id,
                urlData.publicUrl
            );

            if (updateResult.error) {
                throw new Error(updateResult.error);
            }

            // 4. Disparar pipeline de processamento (não-bloqueante para o polling)
            fetch("/api/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcriptionId: result.id, engine }),
            }).catch((err) => {
                console.error("Process error:", err);
            });

            // O polling cuida do resto! O useEffect acima vai atualizar o progresso
            toast.info("Pipeline de IA iniciado!", {
                description: "Acompanhe o progresso em tempo real.",
            });
        } catch (err) {
            console.error("Upload error:", err);
            setErrorMsg(err instanceof Error ? err.message : "Erro inesperado.");
            setIsError(true);
            setIsProcessing(false);
            toast.error("Erro", {
                description: err instanceof Error ? err.message : "Erro inesperado.",
            });
        }
    }, [selectedFile, title, glossary, engine, router]);

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto py-4">
            {/* Top Navigation */}
            <div className="flex justify-between items-center mb-6">
                <Button
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => router.push("/dashboard")}
                    disabled={isProcessing}
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar ao Dashboard
                </Button>
                <div className="text-sm font-medium text-foreground">
                    Nova Degravação - Passo 2 de 3
                </div>
            </div>

            {/* Main Card */}
            <Card className="border-border bg-white shadow-sm overflow-hidden p-0 rounded-2xl w-full mx-auto sm:max-w-2xl">
                {/* Progress Tabs (Visual Only for Mockup match) */}
                <div className="flex border-b pt-6 px-6">
                    <div className="flex-1 text-center pb-3 border-b-[3px] border-[#841b2d] text-foreground font-semibold -mb-[2px] z-10 transition-colors">
                        1. Detalhes
                    </div>
                    <div className="flex-1 text-center pb-3 text-muted-foreground font-medium border-b-[3px] border-transparent -mb-[2px] z-10">
                        2. Configurações
                    </div>
                    <div className="flex-1 text-center pb-3 text-muted-foreground font-medium border-b-[3px] border-transparent -mb-[2px] z-10">
                        3. Arquivo
                    </div>
                </div>

                <CardHeader className="pt-8 pb-4">
                    <CardTitle className="text-3xl font-bold">Nova Degravação</CardTitle>
                    <CardDescription className="text-sm mt-1">
                        Detalhes da Audiência
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Progress Card (real-time) */}
                    {(isProcessing || isDone || isError) && (
                        <div className="mb-6 border rounded-xl overflow-hidden bg-gray-50/50">
                            <div className="flex items-center justify-between p-4 pb-2">
                                <span className="flex items-center gap-2 text-sm font-medium">
                                    {isDone ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    ) : isError ? (
                                        <AlertCircle className="h-4 w-4 text-red-600" />
                                    ) : (
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    )}
                                    {progressLabel}
                                </span>
                                <span className="text-sm font-mono text-muted-foreground">
                                    {progress}%
                                </span>
                            </div>
                            <div className="px-4 pb-3">
                                <Progress value={progress} className="h-2" />
                            </div>
                            <div className="border-t border-border px-4 py-3 grid grid-cols-4 gap-1 text-xs text-center">
                                <div className={progress >= 10 ? "text-foreground font-medium" : "text-muted-foreground"}>
                                    Upload
                                </div>
                                <div className={progress >= 25 ? "text-foreground font-medium" : "text-muted-foreground"}>
                                    Conversão
                                </div>
                                <div className={progress >= 55 ? "text-foreground font-medium" : "text-muted-foreground"}>
                                    {engine === "deepgram" ? "Deepgram" : engine === "google" ? "Chirp 3" : engine === "aws" ? "Transcribe" : "Whisper"}
                                </div>
                                <div className={progress >= 100 ? "text-foreground font-medium" : "text-muted-foreground"}>
                                    Format
                                </div>
                            </div>
                            {isError && errorMsg && (
                                <div className="border-t border-red-100 px-4 py-3 bg-red-50/50">
                                    <p className="text-sm text-red-600 font-medium">{errorMsg}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Title */}
                    <div className="space-y-2">
                        <Label htmlFor="title" className="font-semibold text-foreground">Número do Processo *</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Ex: 12345-67.2024.8.13.0001"
                            disabled={isProcessing || isDone}
                            className="bg-gray-50/50 border-gray-200 shadow-none h-11"
                        />
                    </div>

                    {/* Glossary */}
                    <div className="space-y-2">
                        <Label htmlFor="glossary" className="font-semibold text-foreground">
                            Palavras-chave <span className="font-normal text-muted-foreground">(opcional)</span>
                        </Label>
                        <Input
                            id="glossary"
                            value={glossary}
                            onChange={(e) => setGlossary(e.target.value)}
                            placeholder="Nomes do juiz, partes, testemunhas, termos técnicos..."
                            disabled={isProcessing || isDone}
                            className="bg-gray-50/50 border-gray-200 shadow-none h-11"
                        />
                    </div>

                    {/* Engine selector */}
                    <div className="space-y-2 pt-2">
                        <Label className="font-semibold text-foreground">Motor de Transcrição</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <button
                                type="button"
                                onClick={() => setEngine("whisper")}
                                disabled={isProcessing || isDone}
                                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-4 text-center transition-all min-h-[90px] ${engine === "whisper"
                                    ? "border-[#841b2d] bg-red-50/30"
                                    : "border-border hover:border-[#841b2d]/30 hover:bg-gray-50"
                                    }`}
                            >
                                <Mic className={`h-5 w-5 ${engine === "whisper" ? "text-[#841b2d]" : "text-muted-foreground"}`} />
                                <div className="space-y-0.5">
                                    <p className={`text-[13px] font-semibold ${engine === "whisper" ? "text-foreground" : "text-muted-foreground"}`}>
                                        Azure Whisper
                                    </p>
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        Modelo generalista OpenAI
                                    </p>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setEngine("deepgram")}
                                disabled={isProcessing || isDone}
                                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-4 text-center transition-all min-h-[90px] ${engine === "deepgram"
                                    ? "border-[#841b2d] bg-red-50/30"
                                    : "border-border hover:border-[#841b2d]/30 hover:bg-gray-50"
                                    }`}
                            >
                                <AudioLines className={`h-5 w-5 ${engine === "deepgram" ? "text-[#841b2d]" : "text-muted-foreground"}`} />
                                <div className="space-y-0.5">
                                    <p className={`text-[13px] font-semibold ${engine === "deepgram" ? "text-foreground" : "text-muted-foreground"}`}>
                                        Deepgram Nova-3
                                    </p>
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        Alta precisão + diarização
                                    </p>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setEngine("google")}
                                disabled={isProcessing || isDone}
                                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-4 text-center transition-all min-h-[90px] ${engine === "google"
                                    ? "border-[#841b2d] bg-red-50/30"
                                    : "border-border hover:border-[#841b2d]/30 hover:bg-gray-50"
                                    }`}
                            >
                                <Globe className={`h-5 w-5 ${engine === "google" ? "text-[#841b2d]" : "text-muted-foreground"}`} />
                                <div className="space-y-0.5">
                                    <p className={`text-[13px] font-semibold ${engine === "google" ? "text-foreground" : "text-muted-foreground"}`}>
                                        Google Chirp 3
                                    </p>
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        Multilíngue + denoiser
                                    </p>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setEngine("aws")}
                                disabled={isProcessing || isDone}
                                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-4 text-center transition-all min-h-[90px] ${engine === "aws"
                                    ? "border-[#841b2d] bg-red-50/30"
                                    : "border-border hover:border-[#841b2d]/30 hover:bg-gray-50"
                                    }`}
                            >
                                <Cloud className={`h-5 w-5 ${engine === "aws" ? "text-[#841b2d]" : "text-muted-foreground"}`} />
                                <div className="space-y-0.5">
                                    <p className={`text-[13px] font-semibold ${engine === "aws" ? "text-foreground" : "text-muted-foreground"}`}>
                                        Amazon Transcribe
                                    </p>
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        Diarização + timestamps
                                    </p>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* File upload */}
                    <div className="pt-2">
                        {!selectedFile ? (
                            <div
                                className="group cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-8 sm:p-12 text-center transition-all hover:border-[#841b2d]/40 hover:bg-red-50/10"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-[#841b2d] transition-colors group-hover:bg-red-100">
                                    <Upload className="h-5 w-5" />
                                </div>
                                <p className="font-semibold text-foreground text-sm">
                                    Arraste e solte seu arquivo aqui
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    ou clique para selecionar
                                </p>
                                <p className="mt-2 text-[11px] text-muted-foreground">
                                    Vídeo (MP4, MKV, AVI, MOV) ou Áudio (MP3, WAV, M4A) — máx. 1 GB
                                </p>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#841b2d]">
                                    {isAudioFile(selectedFile.name) ? (
                                        <Music className="h-5 w-5" />
                                    ) : (
                                        <FileVideo className="h-5 w-5" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium text-foreground text-sm">{selectedFile.name}</p>
                                    <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                                </div>
                                {!isProcessing && !isDone && (
                                    <Button variant="ghost" size="sm" onClick={clearFile} className="text-muted-foreground hover:text-foreground">
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPTED_ALL}
                            className="hidden"
                            onChange={handleFileSelect}
                            disabled={isProcessing || isDone}
                        />
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex gap-4 pt-4 border-t mt-4">
                        <Button
                            variant="outline"
                            className="flex-1 py-6 h-12 font-medium bg-white text-foreground"
                            onClick={() => router.push("/dashboard")}
                            disabled={isProcessing || isDone}
                        >
                            Voltar
                        </Button>
                        {!isError ? (
                            <Button
                                onClick={handleSubmit}
                                disabled={!title.trim() || !selectedFile || isProcessing || isDone}
                                className="flex-1 py-6 h-12 font-semibold bg-[#841b2d] hover:bg-[#6b1624] text-white shadow-sm"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Processando...
                                    </>
                                ) : isDone ? (
                                    <>
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        Começar
                                    </>
                                ) : (
                                    "Avançar"
                                )}
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                className="flex-1 py-6 h-12 font-semibold border-red-200 text-red-600 hover:bg-red-50"
                                onClick={() => {
                                    setIsError(false);
                                    setIsProcessing(false);
                                    setProgress(0);
                                    setErrorMsg("");
                                    setTranscriptionId(null);
                                }}
                            >
                                Tentar novamente
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
