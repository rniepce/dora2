// ─── Database Types ────────────────────────────────────────────────────────────
// Espelham o schema SQL até configurarmos a geração automática de tipos Supabase.

export type TranscriptionStatus =
    | "uploading"
    | "transcribing"
    | "formatting"
    | "completed"
    | "error";

export interface Word {
    word: string;
    start: number;
    end: number;
    confidence: number;
    speaker: number;
}

export interface Utterance {
    id: string;
    transcription_id: string;
    speaker_label: string;
    text: string;
    start_time: number;
    end_time: number;
    words: Word[] | null;
    sort_order: number;
    created_at: string;
}

export interface Transcription {
    id: string;
    user_id: string;
    title: string;
    status: TranscriptionStatus;
    media_url: string | null;
    glossary: string | null;
    engine: "whisper" | "deepgram";
    created_at: string;
    updated_at: string;
    // Campos computados (aggregate)
    utterance_count?: number;
    // Campos de compartilhamento (preenchidos no dashboard)
    is_shared?: boolean;
    shared_by_email?: string;
    // Relação opcional (join)
    utterances?: Utterance[];
}

export interface SharedTranscription {
    id: string;
    transcription_id: string;
    shared_by: string;
    shared_with: string;
    created_at: string;
}

export interface ShareInfo {
    id: string;
    shared_with_id: string;
    shared_with_email: string;
    created_at: string;
}
