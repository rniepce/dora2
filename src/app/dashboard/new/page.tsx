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
} from "lucide-react";
import { toast } from "sonner";

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
    const [engine, setEngine] = useState<"whisper" | "deepgram">("deepgram");
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
        if (file) setSelectedFile(file);
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

            // 2. Upload para Supabase Storage
            const supabase = createClient();
            const ext = selectedFile.name.split(".").pop()?.toLowerCase() ?? "mp3";
            const filePath = `${result.id}/media.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from("media")
                .upload(filePath, selectedFile, {
                    contentType: selectedFile.type || "audio/mpeg",
                    upsert: true,
                });

            if (uploadError) {
                throw new Error(`Upload falhou: ${uploadError.message}`);
            }

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
        <div>
            {/* Back */}
            <Button
                variant="ghost"
                className="mb-6 text-muted-foreground hover:text-foreground"
                onClick={() => router.push("/dashboard")}
                disabled={isProcessing}
            >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao Dashboard
            </Button>

            <div className="mx-auto max-w-2xl">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        Nova Degravação
                    </h1>
                    <p className="mt-1 text-muted-foreground">
                        Envie o vídeo ou áudio da audiência para transcrição automática.
                    </p>
                </div>

                {/* Progress Card (real-time) */}
                {(isProcessing || isDone || isError) && (
                    <Card className="mb-6 border-border bg-white shadow-sm overflow-hidden">
                        <CardContent className="p-0">
                            {/* Progress header */}
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

                            {/* Progress bar */}
                            <div className="px-4 pb-3">
                                <Progress value={progress} className="h-3" />
                            </div>

                            {/* Pipeline steps */}
                            <div className="border-t border-border px-4 py-3 grid grid-cols-4 gap-1 text-xs text-center">
                                <div className={progress >= 10 ? "text-foreground font-medium" : "text-muted-foreground"}>
                                    {progress >= 10 ? "✓" : "○"} Upload
                                </div>
                                <div className={progress >= 25 ? "text-foreground font-medium" : "text-muted-foreground"}>
                                    {progress >= 25 ? "✓" : progress >= 15 ? "◌" : "○"} Conversão
                                </div>
                                <div className={progress >= 55 ? "text-foreground font-medium" : "text-muted-foreground"}>
                                    {progress >= 55 ? "✓" : progress >= 35 ? "◌" : "○"} {engine === "deepgram" ? "Deepgram" : "Whisper"}
                                </div>
                                <div className={progress >= 100 ? "text-foreground font-medium" : "text-muted-foreground"}>
                                    {progress >= 100 ? "✓" : progress >= 70 ? "◌" : "○"} IA Format
                                </div>
                            </div>

                            {isError && errorMsg && (
                                <div className="border-t border-border px-4 py-2">
                                    <p className="text-sm text-red-600">{errorMsg}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Form */}
                <Card className="border-border bg-white shadow-sm">
                    <CardHeader>
                        <CardTitle>Detalhes da Audiência</CardTitle>
                        <CardDescription>
                            Preencha as informações e selecione o arquivo de mídia.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Title */}
                        <div className="space-y-2">
                            <Label htmlFor="title">Título / Nº do Processo *</Label>
                            <Input
                                id="title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Ex: Processo nº 12345-67.2024.8.13.0001"
                                disabled={isProcessing || isDone}
                            />
                        </div>

                        {/* Glossary */}
                        <div className="space-y-2">
                            <Label htmlFor="glossary">
                                Glossário Prévio{" "}
                                <span className="text-muted-foreground font-normal">(opcional)</span>
                            </Label>
                            <Textarea
                                id="glossary"
                                value={glossary}
                                onChange={(e) => setGlossary(e.target.value)}
                                placeholder="Nomes do juiz, partes, testemunhas, termos técnicos..."
                                rows={3}
                                disabled={isProcessing || isDone}
                                className="resize-none"
                            />
                            <p className="text-xs text-muted-foreground">
                                Esses termos melhoram a precisão da transcrição.
                            </p>
                        </div>

                        {/* Engine selector */}
                        <div className="space-y-2">
                            <Label>Motor de Transcrição</Label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setEngine("whisper")}
                                    disabled={isProcessing || isDone}
                                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${engine === "whisper"
                                        ? "border-primary bg-red-50/50 shadow-sm"
                                        : "border-border hover:border-primary/30 hover:bg-gray-50"
                                        }`}
                                >
                                    <Mic className={`h-6 w-6 ${engine === "whisper" ? "text-primary" : "text-muted-foreground"}`} />
                                    <div>
                                        <p className={`text-sm font-semibold ${engine === "whisper" ? "text-foreground" : "text-muted-foreground"}`}>
                                            Azure Whisper
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                                            Modelo generalista OpenAI
                                        </p>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setEngine("deepgram")}
                                    disabled={isProcessing || isDone}
                                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${engine === "deepgram"
                                        ? "border-primary bg-red-50/50 shadow-sm"
                                        : "border-border hover:border-primary/30 hover:bg-gray-50"
                                        }`}
                                >
                                    <AudioLines className={`h-6 w-6 ${engine === "deepgram" ? "text-primary" : "text-muted-foreground"}`} />
                                    <div>
                                        <p className={`text-sm font-semibold ${engine === "deepgram" ? "text-foreground" : "text-muted-foreground"}`}>
                                            Deepgram Nova-3
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                                            Alta precisão + diarização nativa
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <Separator />

                        {/* File upload */}
                        <div className="space-y-2">
                            <Label>Arquivo de mídia *</Label>

                            {!selectedFile ? (
                                <div
                                    className="group cursor-pointer rounded-xl border-2 border-dashed border-border p-8 text-center transition-all hover:border-primary/40 hover:bg-red-50/30"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-primary transition-colors group-hover:bg-red-100">
                                        <Upload className="h-6 w-6" />
                                    </div>
                                    <p className="font-medium text-foreground">
                                        Clique para selecionar arquivo
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Vídeo (MP4, MKV, AVI, MOV) ou Áudio (MP3, WAV, M4A)
                                    </p>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 rounded-xl border border-border bg-gray-50 p-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-primary">
                                        {isAudioFile(selectedFile.name) ? (
                                            <Music className="h-5 w-5" />
                                        ) : (
                                            <FileVideo className="h-5 w-5" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium text-foreground">{selectedFile.name}</p>
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

                        {/* Submit */}
                        <Button
                            onClick={handleSubmit}
                            disabled={!title.trim() || !selectedFile || isProcessing || isDone}
                            className="w-full gradient-primary font-semibold text-white shadow-md hover:shadow-lg"
                            size="lg"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processando...
                                </>
                            ) : isDone ? (
                                <>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Enviado com sucesso!
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 h-4 w-4" />
                                    Iniciar Upload
                                </>
                            )}
                        </Button>

                        {isError && (
                            <Button
                                variant="outline"
                                className="w-full"
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
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
