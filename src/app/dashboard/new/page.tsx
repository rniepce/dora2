"use client";

import { useState, useRef, useCallback } from "react";
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

type UploadStep = "form" | "uploading" | "processing" | "done" | "error";

const AUDIO_EXTENSIONS = new Set([
    "mp3", "wav", "ogg", "m4a", "aac", "flac", "wma",
]);

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

    // Form state
    const [title, setTitle] = useState("");
    const [glossary, setGlossary] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Pipeline state
    const [step, setStep] = useState<UploadStep>("form");
    const [uploadProgress, setUploadProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState("");

    // ─── File selection ──────────────────────────────────────────────────────
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    }, []);

    const clearFile = useCallback(() => {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    // ─── Submit pipeline ────────────────────────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (!selectedFile || !title.trim()) {
            toast.error("Preencha o título e selecione um arquivo.");
            return;
        }

        try {
            // 1) Criar registro no banco
            const result = await createTranscriptionAction({
                title: title.trim(),
                glossary: glossary.trim() || null,
            });

            if (result.error || !result.id) {
                throw new Error(result.error || "Erro ao criar degravação.");
            }

            const transcriptionId = result.id;

            // 2) Upload direto para Supabase Storage
            setStep("uploading");
            setUploadProgress(10);

            const supabase = createClient();
            const ext = selectedFile.name.split(".").pop()?.toLowerCase() ?? "mp3";
            const filePath = `${transcriptionId}/media.${ext}`;

            setUploadProgress(30);

            const { error: uploadError } = await supabase.storage
                .from("media")
                .upload(filePath, selectedFile, {
                    contentType: selectedFile.type || "audio/mpeg",
                    upsert: true,
                });

            if (uploadError) {
                throw new Error(`Upload falhou: ${uploadError.message}`);
            }

            setUploadProgress(70);

            // 3) Pegar URL pública e atualizar o registro
            const { data: urlData } = supabase.storage
                .from("media")
                .getPublicUrl(filePath);

            const updateResult = await updateTranscriptionMediaUrl(
                transcriptionId,
                urlData.publicUrl
            );

            if (updateResult.error) {
                throw new Error(updateResult.error);
            }

            setUploadProgress(100);

            // 4) Disparar pipeline de IA (transcrição + formatação)
            setStep("processing");

            toast.info("Upload concluído! Iniciando transcrição...", {
                description: "O pipeline de IA está processando o áudio.",
            });

            const processRes = await fetch("/api/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcriptionId }),
            });

            if (!processRes.ok) {
                const err = await processRes.json();
                console.error("Process pipeline error:", err);
                toast.warning("Upload OK, mas o processamento falhou", {
                    description: err.error || "Você pode tentar reprocessar depois.",
                });
            } else {
                toast.success("Degravação concluída!", {
                    description: "Transcrição e formatação finalizadas com sucesso.",
                });
            }

            setStep("done");

            // Redirecionar para o dashboard após 2 segundos
            setTimeout(() => {
                router.push("/dashboard");
                router.refresh();
            }, 2000);
        } catch (err) {
            console.error("Upload pipeline error:", err);
            setErrorMsg(err instanceof Error ? err.message : "Erro inesperado.");
            setStep("error");
            toast.error("Erro no upload", {
                description: err instanceof Error ? err.message : "Erro inesperado.",
            });
        }
    }, [selectedFile, title, glossary, router]);

    // ─── Progress display helpers ───────────────────────────────────────────
    const getOverallProgress = (): number => {
        if (step === "form") return 0;
        if (step === "uploading") return Math.round(uploadProgress * 0.6); // 0-60%
        if (step === "processing") return 70;
        if (step === "done") return 100;
        return 0;
    };

    const getStepLabel = (): string => {
        switch (step) {
            case "uploading":
                return `Enviando arquivo... ${uploadProgress}%`;
            case "processing":
                return "Transcrevendo e formatando com IA...";
            case "done":
                return "Concluído!";
            case "error":
                return "Erro";
            default:
                return "";
        }
    };

    const isProcessing = step === "uploading" || step === "processing";

    return (
        <div>
            {/* Back button */}
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

                {/* Progress bar (visible during processing) */}
                {step !== "form" && (
                    <Card className="mb-6 border-border bg-white shadow-sm">
                        <CardContent className="p-4">
                            <div className="mb-2 flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2 font-medium">
                                    {step === "done" ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    ) : step === "error" ? (
                                        <AlertCircle className="h-4 w-4 text-red-600" />
                                    ) : (
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    )}
                                    {getStepLabel()}
                                </span>
                                <span className="text-muted-foreground">
                                    {getOverallProgress()}%
                                </span>
                            </div>
                            <Progress value={getOverallProgress()} className="h-2" />

                            {step === "error" && errorMsg && (
                                <p className="mt-2 text-sm text-red-600">{errorMsg}</p>
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
                                disabled={isProcessing || step === "done"}
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
                                placeholder="Nomes do juiz, partes, testemunhas, termos técnicos... (um por linha)"
                                rows={3}
                                disabled={isProcessing || step === "done"}
                                className="resize-none"
                            />
                            <p className="text-xs text-muted-foreground">
                                Esses termos serão usados como contexto para melhorar a precisão
                                da transcrição.
                            </p>
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
                                        <p className="truncate font-medium text-foreground">
                                            {selectedFile.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatBytes(selectedFile.size)}
                                        </p>
                                    </div>
                                    {!isProcessing && step !== "done" && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={clearFile}
                                            className="text-muted-foreground hover:text-foreground"
                                        >
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
                                disabled={isProcessing || step === "done"}
                            />
                        </div>

                        {/* Submit */}
                        <Button
                            onClick={handleSubmit}
                            disabled={!title.trim() || !selectedFile || isProcessing || step === "done"}
                            className="w-full gradient-primary font-semibold text-white shadow-md hover:shadow-lg"
                            size="lg"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processando...
                                </>
                            ) : step === "done" ? (
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

                        {step === "error" && (
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => {
                                    setStep("form");
                                    setErrorMsg("");
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
