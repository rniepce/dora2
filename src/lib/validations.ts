import { z } from "zod";

export const uuidSchema = z.string().uuid("ID inválido");

export const chatRequestSchema = z.object({
    transcriptionId: uuidSchema,
    messages: z.array(
        z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(10000),
        })
    ).min(1).max(50),
});

export const summarizeRequestSchema = z.object({
    transcriptionId: uuidSchema,
    force: z.boolean().optional(),
});

export const processRequestSchema = z.object({
    transcriptionId: uuidSchema,
    engine: z.enum(["whisper", "deepgram", "google"]).optional().default("whisper"),
});

export const formatRequestSchema = z.object({
    transcriptionId: uuidSchema,
});

export const transcribeRequestSchema = z.object({
    transcriptionId: uuidSchema,
});
