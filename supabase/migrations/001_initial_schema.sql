-- ============================================================================
-- JusScribe — Schema Inicial
-- Execute este SQL no Supabase Dashboard > SQL Editor
-- ============================================================================

-- Enum para status do pipeline de transcrição
CREATE TYPE transcription_status AS ENUM (
  'uploading',
  'transcribing',
  'formatting',
  'completed',
  'error'
);

-- ─── Tabela: transcriptions ─────────────────────────────────────────────────
CREATE TABLE transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status transcription_status NOT NULL DEFAULT 'uploading',
  media_url TEXT,
  glossary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Tabela: utterances (falas diarizadas) ──────────────────────────────────
CREATE TABLE utterances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcription_id UUID NOT NULL REFERENCES transcriptions(id) ON DELETE CASCADE,
  speaker_label TEXT NOT NULL DEFAULT 'SPEAKER_00',
  text TEXT NOT NULL,
  start_time DOUBLE PRECISION NOT NULL,
  end_time DOUBLE PRECISION NOT NULL,
  words JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Índices ────────────────────────────────────────────────────────────────
CREATE INDEX idx_transcriptions_user_id ON transcriptions(user_id);
CREATE INDEX idx_utterances_transcription_id ON utterances(transcription_id);
CREATE INDEX idx_utterances_sort_order ON utterances(transcription_id, sort_order);

-- ─── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE utterances ENABLE ROW LEVEL SECURITY;

-- Usuário só acessa suas próprias degravações
CREATE POLICY "Users can CRUD own transcriptions"
  ON transcriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Usuário só acessa utterances das suas degravações
CREATE POLICY "Users can CRUD own utterances"
  ON utterances FOR ALL
  USING (
    transcription_id IN (
      SELECT id FROM transcriptions WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    transcription_id IN (
      SELECT id FROM transcriptions WHERE user_id = auth.uid()
    )
  );

-- ─── Storage Bucket ─────────────────────────────────────────────────────────
-- Crie manualmente no Supabase Dashboard:
-- 1. Vá em Storage > New Bucket
-- 2. Nome: "media"
-- 3. Marque como "Private"
-- 4. Adicione policy: authenticated users podem INSERT/SELECT nos seus próprios arquivos
